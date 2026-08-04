import hashlib
import uuid
from typing import Literal

import zstandard as zstd
from sqlalchemy import delete, func, select, text, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.document import Document
from app.models.document_share import DocumentShare
from app.models.document_version import DocumentVersion
from app.models.document_version_content import DocumentVersionContent
from app.models.folder import Folder
from app.models.folder_share import FolderShare
from app.models.user import User


PermissionLevel = Literal["owner", "editor", "viewer"]

# --- zstd delta-chain codec ------------------------------------------------
#
# Full snapshots are plain zstd frames. Deltas compress against the previous
# version's plaintext used as a *raw-content* dictionary, so an incremental edit
# stores only the difference. Long-distance matching + a >=1 MB window keep a
# 500 KB base fully in range (the content cap is 500 KB). One-shot compress()
# embeds the content size in the frame header, but we still pass an explicit
# `max_output_size` bound on decompress so dictionary frames without an embedded
# size can never trip an "unknown size" error — 2 MB sits safely above the cap.
_ZSTD_LEVEL = 19
_ZSTD_WINDOW_LOG = 27
_ZSTD_MAX_OUTPUT = 2 * 1024 * 1024  # 2 MB, above the 500 KB plaintext cap


def _delta_params() -> "zstd.ZstdCompressionParameters":
    # Long-distance matching + a 128 MB max window (sized down to the input by
    # zstd) keep a 500 KB raw-content dictionary fully reachable from any offset.
    return zstd.ZstdCompressionParameters(
        compression_level=_ZSTD_LEVEL,
        window_log=_ZSTD_WINDOW_LOG,
        enable_ldm=True,
    )


def _compress_full(content_bytes: bytes) -> bytes:
    return zstd.ZstdCompressor(level=_ZSTD_LEVEL).compress(content_bytes)


def _compress_delta(content_bytes: bytes, base_bytes: bytes) -> bytes:
    d = zstd.ZstdCompressionDict(base_bytes, dict_type=zstd.DICT_TYPE_RAWCONTENT)
    c = zstd.ZstdCompressor(dict_data=d, compression_params=_delta_params())
    return c.compress(content_bytes)


def _decompress_full(payload: bytes) -> bytes:
    return zstd.ZstdDecompressor().decompress(payload, max_output_size=_ZSTD_MAX_OUTPUT)


def _decompress_delta(payload: bytes, base_bytes: bytes) -> bytes:
    d = zstd.ZstdCompressionDict(base_bytes, dict_type=zstd.DICT_TYPE_RAWCONTENT)
    return zstd.ZstdDecompressor(dict_data=d).decompress(
        payload, max_output_size=_ZSTD_MAX_OUTPUT
    )


async def resolve_document_internal_id(
    db: AsyncSession, public_id: uuid.UUID
) -> int | None:
    """Resolve a document's public UUID to its internal BIGINT ID."""
    result = await db.execute(
        select(Document.id).where(Document.public_id == public_id)
    )
    return result.scalar_one_or_none()


async def resolve_document_permission(
    db: AsyncSession, document_id: int, user_id: int
) -> PermissionLevel | None:
    """Resolve the effective permission for a user on a document.

    Priority: owner > direct document share > folder share.
    Returns None if no access.
    """
    result = await db.execute(
        select(Document.owner_id, Document.folder_id).where(Document.id == document_id)
    )
    row = result.one_or_none()
    if row is None:
        return None

    owner_id, folder_id = row
    if owner_id == user_id:
        return "owner"

    # Check document_shares
    ds_result = await db.execute(
        select(DocumentShare.permission).where(
            DocumentShare.document_id == document_id,
            DocumentShare.shared_with_id == user_id,
        )
    )
    ds_perm = ds_result.scalar_one_or_none()
    if ds_perm is not None:
        return ds_perm

    # Check folder_shares (if document is in a folder)
    if folder_id is not None:
        fs_result = await db.execute(
            select(FolderShare.permission).where(
                FolderShare.folder_id == folder_id,
                FolderShare.shared_with_id == user_id,
            )
        )
        fs_perm = fs_result.scalar_one_or_none()
        if fs_perm is not None:
            return fs_perm

    return None


async def resolve_folder_permission(
    db: AsyncSession, folder_id: int, user_id: int
) -> PermissionLevel | None:
    """Resolve the effective permission for a user on a folder.

    Priority: owner > folder share.
    """
    result = await db.execute(
        select(Folder.owner_id).where(Folder.id == folder_id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        return None

    if row == user_id:
        return "owner"

    # Check folder_shares
    fs_result = await db.execute(
        select(FolderShare.permission).where(
            FolderShare.folder_id == folder_id,
            FolderShare.shared_with_id == user_id,
        )
    )
    fs_perm = fs_result.scalar_one_or_none()
    if fs_perm is not None:
        return fs_perm

    return None


async def get_document_with_permission(
    db: AsyncSession, document_id: int, user_id: int
) -> tuple[Document, PermissionLevel] | tuple[None, None]:
    """Fetch a document and its permission level for the user."""
    permission = await resolve_document_permission(db, document_id, user_id)
    if permission is None:
        return None, None

    result = await db.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one_or_none()
    if doc is None:
        return None, None

    return doc, permission


def compute_content_hash(content: str) -> tuple[bytes, bytes]:
    """Compute SHA-256 hash and return (hash_bytes, content_bytes)."""
    content_bytes = content.encode("utf-8")
    content_hash = hashlib.sha256(content_bytes).digest()
    return content_hash, content_bytes


async def reconstruct_content(db: AsyncSession, content_id: int) -> str:
    """Reconstruct the plaintext for a ``document_version_content`` entry.

    Walks ``base_id`` from ``content_id`` down to its full snapshot with a
    recursive CTE, then decompresses forward (full → deltas → target), each
    delta using the running plaintext as its raw-content dictionary. Asserts the
    reconstructed sha256 matches the stored ``content_hash`` — a wrong delta can
    never be observed as valid content; on mismatch it raises so the caller
    surfaces a 500 rather than serving corrupt bytes.
    """
    rows = (
        await db.execute(
            text(
                """
                WITH RECURSIVE chain AS (
                    SELECT id, kind, base_id, depth, payload, content_hash
                    FROM document_version_content
                    WHERE id = :cid
                    UNION ALL
                    SELECT c.id, c.kind, c.base_id, c.depth, c.payload, c.content_hash
                    FROM document_version_content c
                    JOIN chain ch ON c.id = ch.base_id
                )
                SELECT kind, payload, content_hash
                FROM chain
                ORDER BY depth ASC
                """
            ),
            {"cid": content_id},
        )
    ).all()

    if not rows:
        raise RuntimeError(f"content entry {content_id} not found for reconstruction")

    text_bytes: bytes | None = None
    for row in rows:
        payload = bytes(row.payload)
        if row.kind == "full":
            text_bytes = _decompress_full(payload)
        else:
            if text_bytes is None:
                # Broken chain (missing base). Refuse to serve rather than guess.
                raise RuntimeError(
                    f"delta chain for content {content_id} is missing its base snapshot"
                )
            text_bytes = _decompress_delta(payload, text_bytes)

    target_hash = bytes(rows[-1].content_hash)
    if hashlib.sha256(text_bytes).digest() != target_hash:
        raise RuntimeError(
            f"reconstructed content {content_id} failed hash verification"
        )
    return text_bytes.decode("utf-8")


async def _store_content_entry(
    db: AsyncSession,
    document_id: int,
    content_bytes: bytes,
    content_hash: bytes,
    base_content: str | None,
    base_content_id: int | None,
) -> int:
    """Persist a new content entry as a full snapshot or forward delta.

    Decides full vs delta (full when there is no base, the chain would reach K,
    or the delta saves too little), inserts the row, then self-verifies by
    reconstructing it and asserting the hash. If a delta fails verification it
    falls back to a full snapshot; a full that still fails aborts the txn.
    """
    byte_size = len(content_bytes)
    full_payload = _compress_full(content_bytes)

    delta_payload: bytes | None = None
    delta_depth = 0
    if base_content_id is not None and base_content is not None:
        base_depth = (
            await db.execute(
                select(DocumentVersionContent.depth).where(
                    DocumentVersionContent.id == base_content_id
                )
            )
        ).scalar_one_or_none()
        if base_depth is not None:
            delta_depth = base_depth + 1
            base_bytes = base_content.encode("utf-8")
            candidate = _compress_delta(content_bytes, base_bytes)
            # Store a delta only if the chain stays under K and the delta is
            # meaningfully smaller than a fresh full snapshot.
            if delta_depth < settings.version_snapshot_interval and len(candidate) < 0.5 * len(
                full_payload
            ):
                delta_payload = candidate

    if delta_payload is not None:
        new_id = await _insert_content_entry(
            db,
            document_id=document_id,
            kind="delta",
            base_id=base_content_id,
            depth=delta_depth,
            payload=delta_payload,
            content_hash=content_hash,
            byte_size=byte_size,
        )
        if await _verify_entry(db, new_id, content_hash):
            return new_id
        # Delta round-tripped wrong — discard it and fall through to a full.
        await db.execute(
            delete(DocumentVersionContent).where(DocumentVersionContent.id == new_id)
        )

    new_id = await _insert_content_entry(
        db,
        document_id=document_id,
        kind="full",
        base_id=None,
        depth=0,
        payload=full_payload,
        content_hash=content_hash,
        byte_size=byte_size,
    )
    if not await _verify_entry(db, new_id, content_hash):
        raise RuntimeError(
            f"full snapshot for document {document_id} failed self-verification"
        )
    return new_id


async def _insert_content_entry(
    db: AsyncSession,
    *,
    document_id: int,
    kind: str,
    base_id: int | None,
    depth: int,
    payload: bytes,
    content_hash: bytes,
    byte_size: int,
) -> int:
    result = await db.execute(
        insert(DocumentVersionContent)
        .values(
            document_id=document_id,
            kind=kind,
            base_id=base_id,
            depth=depth,
            payload=payload,
            content_hash=content_hash,
            byte_size=byte_size,
        )
        .returning(DocumentVersionContent.id)
    )
    return result.scalar_one()


async def _verify_entry(db: AsyncSession, content_id: int, expected_hash: bytes) -> bool:
    """Reconstruct a just-written entry and confirm it round-trips byte-exact."""
    try:
        reconstructed = await reconstruct_content(db, content_id)
    except Exception:
        return False
    return hashlib.sha256(reconstructed.encode("utf-8")).digest() == expected_hash


async def create_version(
    db: AsyncSession,
    document_id: int,
    content: str,
    user_id: int,
    source: str = "manual",
    label: str | None = None,
    dedup: bool = False,
) -> int | None:
    """Create a document version backed by the delta-chain content store.

    With ``dedup=True`` (auto-save / sync paths) the version is created only if
    the content actually differs from the document's current content. The
    document row is locked ``FOR UPDATE`` first, so two concurrent saves of
    identical content can't both create a version. Returns the new version
    number, or ``None`` when dedup suppressed a no-op.

    With ``dedup=False`` (manual / checkpoint / restore) a version is always
    created, but the document's edit metadata (``last_edited_by``,
    ``updated_at``) is left untouched when the content is unchanged — a labeled
    checkpoint of the current state shouldn't masquerade as a fresh edit.

    Callers pass full content; ``current_content`` stays the full HEAD text.
    """
    content_hash, content_bytes = compute_content_hash(content)

    # 1. Lock the document row and read HEAD state. Serializes concurrent
    #    create_versions on the same document (dedup guard + delta chaining).
    row = (
        await db.execute(
            select(
                Document.current_content,
                Document.current_content_hash,
                Document.current_content_id,
                Document.version_counter,
            )
            .where(Document.id == document_id)
            .with_for_update()
        )
    ).one_or_none()
    if row is None:
        return None  # document vanished
    cur_content, cur_hash, cur_content_id, version_counter = row

    # 2. Dedup no-op guard: identical content, nothing to do.
    if dedup and cur_hash == content_hash:
        return None

    content_changed = cur_hash != content_hash

    # 3. Dedup-reuse: an existing entry for this doc already holds this content.
    content_id = (
        await db.execute(
            select(DocumentVersionContent.id)
            .where(
                DocumentVersionContent.document_id == document_id,
                DocumentVersionContent.content_hash == content_hash,
            )
            .limit(1)
        )
    ).scalar_one_or_none()

    # 4/5. Otherwise store a new full/delta entry (self-verifying, full fallback).
    if content_id is None:
        content_id = await _store_content_entry(
            db,
            document_id=document_id,
            content_bytes=content_bytes,
            content_hash=content_hash,
            base_content=cur_content,
            base_content_id=cur_content_id,
        )

    new_version_number = version_counter + 1

    # 6. Update HEAD. Unchanged non-dedup content still repoints
    #    current_content_id but must not fake an edit (keep updated_at frozen).
    if content_changed:
        values = dict(
            current_content=content,
            current_content_hash=content_hash,
            current_content_id=content_id,
            version_counter=new_version_number,
            updated_at=func.now(),
            last_edited_by=user_id,
        )
    else:
        values = dict(
            current_content_id=content_id,
            version_counter=new_version_number,
            updated_at=Document.updated_at,
        )
    await db.execute(
        update(Document).where(Document.id == document_id).values(**values)
    )

    # 7. Insert version metadata.
    await db.execute(
        insert(DocumentVersion).values(
            document_id=document_id,
            content_id=content_id,
            version_number=new_version_number,
            created_by=user_id,
            source=source,
            label=label,
        )
    )

    return new_version_number


async def is_document_shared(db: AsyncSession, document_id: int) -> bool:
    """Check if a document has any active shares (user shares or public links)."""
    from app.models.public_share_link import PublicShareLink

    ds_result = await db.execute(
        select(func.count()).where(DocumentShare.document_id == document_id)
    )
    if ds_result.scalar_one() > 0:
        return True

    pl_result = await db.execute(
        select(func.count()).where(
            PublicShareLink.document_id == document_id,
            PublicShareLink.is_active.is_(True),
        )
    )
    return pl_result.scalar_one() > 0


async def is_folder_shared(db: AsyncSession, folder_id: int) -> bool:
    """Check if a folder has any active user shares."""
    fs_result = await db.execute(
        select(func.count()).where(FolderShare.folder_id == folder_id)
    )
    return fs_result.scalar_one() > 0


async def get_user_brief(db: AsyncSession, user_id: int) -> dict | None:
    """Get a brief user representation for API responses."""
    result = await db.execute(
        select(User.id, User.display_name, User.username).where(User.id == user_id)
    )
    row = result.one_or_none()
    if row is None:
        return None
    return {"id": row.id, "display_name": row.display_name, "username": row.username}
