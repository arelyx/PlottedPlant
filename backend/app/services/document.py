import hashlib
import uuid
from typing import Literal

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document
from app.models.document_content import DocumentContent
from app.models.document_share import DocumentShare
from app.models.document_version import DocumentVersion
from app.models.folder import Folder
from app.models.folder_share import FolderShare
from app.models.user import User


PermissionLevel = Literal["owner", "editor", "viewer"]


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


async def create_version(
    db: AsyncSession,
    document_id: int,
    content: str,
    user_id: int,
    source: str = "manual",
    label: str | None = None,
    dedup: bool = False,
) -> int | None:
    """Create a document version using the content-addressable dedup pattern.

    With ``dedup=True`` (auto-save / sync paths) the version is created only if
    the content actually differs from the document's current content, and the
    check is atomic — two concurrent saves of identical content can't both
    create a version. Returns the new version number, or ``None`` when dedup
    suppressed a no-op.

    With ``dedup=False`` (manual / checkpoint / restore) a version is always
    created, but the document's edit metadata (``last_edited_by``,
    ``updated_at``) is left untouched when the content is unchanged — a labeled
    checkpoint of the current state shouldn't masquerade as a fresh edit.
    """
    content_hash, content_bytes = compute_content_hash(content)

    # 1. Insert content (deduplicated)
    await db.execute(
        insert(DocumentContent)
        .values(
            content_hash=content_hash,
            content=content,
            byte_size=len(content_bytes),
        )
        .on_conflict_do_nothing(index_elements=["content_hash"])
    )

    # 2. Bump version counter and (if the content changed) update current content
    if dedup:
        # Atomic no-op guard: only proceed if the current hash still differs.
        result = await db.execute(
            update(Document)
            .where(
                Document.id == document_id,
                Document.current_content_hash != content_hash,
            )
            .values(
                current_content=content,
                current_content_hash=content_hash,
                version_counter=Document.version_counter + 1,
                updated_at=func.now(),
                last_edited_by=user_id,
            )
            .returning(Document.version_counter)
        )
        new_version_number = result.scalar_one_or_none()
        if new_version_number is None:
            return None  # content unchanged — no version created
    else:
        current_hash = (
            await db.execute(
                select(Document.current_content_hash).where(Document.id == document_id)
            )
        ).scalar_one()
        if current_hash != content_hash:
            values = dict(
                current_content=content,
                current_content_hash=content_hash,
                version_counter=Document.version_counter + 1,
                updated_at=func.now(),
                last_edited_by=user_id,
            )
        else:
            # Same content: allocate a version number but don't fake an edit.
            # Setting updated_at to itself keeps it out of onupdate's reach so a
            # labeled checkpoint doesn't bump the document's modified time.
            values = dict(
                version_counter=Document.version_counter + 1,
                updated_at=Document.updated_at,
            )
        result = await db.execute(
            update(Document)
            .where(Document.id == document_id)
            .values(**values)
            .returning(Document.version_counter)
        )
        new_version_number = result.scalar_one()

    # 3. Insert version metadata
    await db.execute(
        insert(DocumentVersion).values(
            document_id=document_id,
            content_hash=content_hash,
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
