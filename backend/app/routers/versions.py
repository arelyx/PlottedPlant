from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user_id, get_db
from app.models.document_content import DocumentContent
from app.models.document_version import DocumentVersion
from app.models.user import User
from app.services.collaboration import notify_force_content
from app.schemas.version import (
    CreateCheckpointRequest,
    CreateCheckpointResponse,
    RestoreResponse,
    UserBrief,
    VersionDetailResponse,
    VersionDiffResponse,
    VersionListItem,
    VersionListResponse,
)
from app.services.document import (
    create_version,
    get_document_with_permission,
)

router = APIRouter(prefix="/api/v1/documents", tags=["versions"])


async def _get_user_brief(db: AsyncSession, user_id: int | None) -> UserBrief | None:
    if user_id is None:
        return None
    result = await db.execute(
        select(User.id, User.display_name).where(User.id == user_id)
    )
    row = result.one_or_none()
    if row is None:
        return None
    return UserBrief(id=row.id, display_name=row.display_name)


@router.get("/{document_id}/versions", response_model=VersionListResponse)
async def list_versions(
    document_id: int,
    cursor: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    source: str | None = Query(None),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """List document versions. Owner and editor only (viewers get 403)."""
    doc, permission = await get_document_with_permission(db, document_id, user_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    if permission == "viewer":
        raise HTTPException(status_code=403, detail="Viewers cannot access version history")

    query = (
        select(DocumentVersion)
        .where(DocumentVersion.document_id == document_id)
        .order_by(DocumentVersion.created_at.desc())
    )

    if source:
        query = query.where(DocumentVersion.source == source)
    if cursor:
        try:
            cursor_dt = datetime.fromisoformat(cursor)
            query = query.where(DocumentVersion.created_at < cursor_dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid cursor format")

    # Fetch one extra to detect has_more
    query = query.limit(limit + 1)
    result = await db.execute(query)
    versions = list(result.scalars().all())

    has_more = len(versions) > limit
    if has_more:
        versions = versions[:limit]

    items = []
    for v in versions:
        created_by = await _get_user_brief(db, v.created_by)
        items.append(
            VersionListItem(
                version_number=v.version_number,
                created_at=v.created_at,
                created_by=created_by,
                label=v.label,
                source=v.source,
            )
        )

    next_cursor = versions[-1].created_at.isoformat() if has_more else None

    return VersionListResponse(items=items, next_cursor=next_cursor, has_more=has_more)


@router.get(
    "/{document_id}/versions/{version_number}",
    response_model=VersionDetailResponse,
)
async def get_version(
    document_id: int,
    version_number: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific version with its content. Owner and editor only."""
    doc, permission = await get_document_with_permission(db, document_id, user_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    if permission == "viewer":
        raise HTTPException(status_code=403, detail="Viewers cannot access version history")

    result = await db.execute(
        select(DocumentVersion).where(
            DocumentVersion.document_id == document_id,
            DocumentVersion.version_number == version_number,
        )
    )
    version = result.scalar_one_or_none()
    if version is None:
        raise HTTPException(status_code=404, detail="Version not found")

    # Fetch content from document_content table
    content_result = await db.execute(
        select(DocumentContent.content).where(
            DocumentContent.content_hash == version.content_hash
        )
    )
    content = content_result.scalar_one()

    created_by = await _get_user_brief(db, version.created_by)

    return VersionDetailResponse(
        version_number=version.version_number,
        created_at=version.created_at,
        created_by=created_by,
        label=version.label,
        source=version.source,
        content=content,
    )


@router.get(
    "/{document_id}/versions/{version_number}/diff",
    response_model=VersionDiffResponse,
)
async def get_version_diff(
    document_id: int,
    version_number: int,
    compare_to: int = Query(...),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get content of two versions for client-side diff rendering."""
    doc, permission = await get_document_with_permission(db, document_id, user_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    if permission == "viewer":
        raise HTTPException(status_code=403, detail="Viewers cannot access version history")

    # Fetch both versions
    result = await db.execute(
        select(DocumentVersion).where(
            DocumentVersion.document_id == document_id,
            DocumentVersion.version_number.in_([version_number, compare_to]),
        )
    )
    versions = {v.version_number: v for v in result.scalars().all()}

    if version_number not in versions or compare_to not in versions:
        raise HTTPException(status_code=404, detail="One or both versions not found")

    # Fetch contents
    hashes = [versions[version_number].content_hash, versions[compare_to].content_hash]
    content_result = await db.execute(
        select(DocumentContent.content_hash, DocumentContent.content).where(
            DocumentContent.content_hash.in_(hashes)
        )
    )
    content_map = {row.content_hash: row.content for row in content_result.all()}

    return VersionDiffResponse(
        base_version=version_number,
        compare_version=compare_to,
        base_content=content_map[versions[version_number].content_hash],
        compare_content=content_map[versions[compare_to].content_hash],
    )


@router.post("/{document_id}/versions", response_model=CreateCheckpointResponse, status_code=201)
async def create_checkpoint(
    document_id: int,
    body: CreateCheckpointRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Create a manual checkpoint version with a label. Owner and editor only."""
    doc, permission = await get_document_with_permission(db, document_id, user_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    if permission == "viewer":
        raise HTTPException(status_code=403, detail="Viewers cannot create checkpoints")

    new_version = await create_version(
        db, document_id, doc.current_content, user_id, source="manual", label=body.label
    )
    await db.commit()

    # Fetch the created version for response
    result = await db.execute(
        select(DocumentVersion).where(
            DocumentVersion.document_id == document_id,
            DocumentVersion.version_number == new_version,
        )
    )
    version = result.scalar_one()
    created_by = await _get_user_brief(db, version.created_by)

    return CreateCheckpointResponse(
        version_number=version.version_number,
        created_at=version.created_at,
        created_by=created_by,
        label=version.label or body.label,
        source=version.source,
    )


@router.post("/{document_id}/versions/{version_number}/restore", response_model=RestoreResponse)
async def restore_version(
    document_id: int,
    version_number: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Restore document to a previous version. Owner only.

    Steps:
    1. Save current content as pre-restore version
    2. Load target version content
    3. Replace document content with target version
    4. Create post-restore version
    """
    doc, permission = await get_document_with_permission(db, document_id, user_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    if permission != "owner":
        raise HTTPException(status_code=403, detail="Only owners can restore versions")

    # Fetch target version content
    target_result = await db.execute(
        select(DocumentVersion).where(
            DocumentVersion.document_id == document_id,
            DocumentVersion.version_number == version_number,
        )
    )
    target_version = target_result.scalar_one_or_none()
    if target_version is None:
        raise HTTPException(status_code=404, detail="Version not found")

    target_content_result = await db.execute(
        select(DocumentContent.content).where(
            DocumentContent.content_hash == target_version.content_hash
        )
    )
    target_content = target_content_result.scalar_one()

    # Step 1: Save current content as pre-restore version
    pre_restore_version = await create_version(
        db,
        document_id,
        doc.current_content,
        user_id,
        source="restore",
        label=f"Auto-saved before restore to version {version_number}",
    )

    # Step 2 & 3: Replace document content with target version
    post_restore_version = await create_version(
        db,
        document_id,
        target_content,
        user_id,
        source="restore",
        label=f"Restored from version {version_number}",
    )

    await db.commit()

    # Notify Hocuspocus to push restored content to active collaborators
    user_result = await db.execute(select(User.display_name).where(User.id == user_id))
    display_name = user_result.scalar_one_or_none() or "Unknown"
    await notify_force_content(
        document_id, target_content, display_name, post_restore_version
    )

    return RestoreResponse(
        restored_to_version=version_number,
        pre_restore_version=pre_restore_version,
        post_restore_version=post_restore_version,
        content=target_content,
    )
