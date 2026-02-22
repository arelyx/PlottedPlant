from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user_id, get_db
from app.models.document import Document
from app.models.folder import Folder
from app.models.folder_share import FolderShare
from app.models.user import User
from app.schemas.folder import (
    FolderCreateRequest,
    FolderDetailResponse,
    FolderListResponse,
    FolderResponse,
    FolderUpdateRequest,
)
from app.services.document import is_folder_shared, resolve_folder_permission

router = APIRouter(prefix="/api/v1/folders", tags=["folders"])


def _folder_to_response(
    folder: Folder,
    permission: str,
    document_count: int,
    shared: bool = False,
    shared_by: dict | None = None,
) -> FolderResponse:
    return FolderResponse(
        id=folder.id,
        name=folder.name,
        permission=permission,
        document_count=document_count,
        shared_by=shared_by,
        is_shared=shared,
        created_at=folder.created_at,
        updated_at=folder.updated_at,
    )


@router.get("", response_model=FolderListResponse)
async def list_folders(
    sort: str = Query("name", pattern="^(name|updated_at)$"),
    order: str = Query("asc", pattern="^(asc|desc)$"),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """List all folders visible to the authenticated user."""
    sort_col = Folder.name if sort == "name" else Folder.updated_at
    order_func = sort_col.asc() if order == "asc" else sort_col.desc()

    # Own folders
    result = await db.execute(
        select(Folder).where(Folder.owner_id == user_id).order_by(order_func)
    )
    own_folders = result.scalars().all()

    # Shared folders
    shared_result = await db.execute(
        select(Folder, FolderShare.permission)
        .join(FolderShare, FolderShare.folder_id == Folder.id)
        .where(FolderShare.shared_with_id == user_id)
        .order_by(order_func)
    )
    shared_rows = shared_result.all()

    all_folder_ids = [f.id for f in own_folders] + [f.id for f, _ in shared_rows]

    # Count documents per folder in a single query
    doc_counts = {}
    if all_folder_ids:
        count_result = await db.execute(
            select(Document.folder_id, func.count(Document.id))
            .where(Document.folder_id.in_(all_folder_ids))
            .group_by(Document.folder_id)
        )
        for fid, count in count_result.all():
            doc_counts[fid] = count

    # Batch-load shared_by info for shared folders
    shared_by_ids = {f.owner_id for f, _ in shared_rows}
    user_map = {}
    if shared_by_ids:
        users_result = await db.execute(
            select(User.id, User.display_name).where(User.id.in_(shared_by_ids))
        )
        for uid, dname in users_result.all():
            user_map[uid] = {"id": uid, "display_name": dname}

    # Check which own folders are shared
    own_shared_ids = set()
    if own_folders:
        fs_result = await db.execute(
            select(FolderShare.folder_id).where(
                FolderShare.folder_id.in_([f.id for f in own_folders])
            ).distinct()
        )
        own_shared_ids.update(r[0] for r in fs_result.all())

    items = [
        _folder_to_response(f, "owner", doc_counts.get(f.id, 0), shared=f.id in own_shared_ids)
        for f in own_folders
    ]
    for folder, perm in shared_rows:
        items.append(_folder_to_response(
            folder, perm, doc_counts.get(folder.id, 0),
            shared=True,
            shared_by=user_map.get(folder.owner_id),
        ))

    return FolderListResponse(items=items)


@router.post("", response_model=FolderResponse, status_code=201)
async def create_folder(
    body: FolderCreateRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Create a new folder."""
    folder = Folder(name=body.name, owner_id=user_id)
    db.add(folder)
    await db.commit()
    await db.refresh(folder)
    return _folder_to_response(folder, "owner", 0)


@router.get("/{folder_id}", response_model=FolderDetailResponse)
async def get_folder(
    folder_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get a single folder's details including its documents."""
    permission = await resolve_folder_permission(db, folder_id, user_id)
    if permission is None:
        raise HTTPException(status_code=404, detail="Folder not found")

    result = await db.execute(select(Folder).where(Folder.id == folder_id))
    folder = result.scalar_one()

    # Fetch documents in this folder
    docs_result = await db.execute(
        select(Document)
        .where(Document.folder_id == folder_id)
        .order_by(Document.updated_at.desc())
    )
    documents = docs_result.scalars().all()

    doc_items = []
    for doc in documents:
        last_edited = None
        if doc.last_edited_by:
            from app.services.document import get_user_brief
            user_brief = await get_user_brief(db, doc.last_edited_by)
            if user_brief:
                last_edited = {"id": user_brief["id"], "display_name": user_brief["display_name"]}
        doc_items.append({
            "id": doc.id,
            "title": doc.title,
            "updated_at": doc.updated_at,
            "last_edited_by": last_edited,
        })

    shared = await is_folder_shared(db, folder.id)

    return FolderDetailResponse(
        id=folder.id,
        name=folder.name,
        permission=permission,
        is_shared=shared,
        created_at=folder.created_at,
        updated_at=folder.updated_at,
        documents=doc_items,
    )


@router.patch("/{folder_id}", response_model=FolderResponse)
async def rename_folder(
    folder_id: int,
    body: FolderUpdateRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Rename a folder. Owner only."""
    permission = await resolve_folder_permission(db, folder_id, user_id)
    if permission is None:
        raise HTTPException(status_code=404, detail="Folder not found")
    if permission != "owner":
        raise HTTPException(
            status_code=403,
            detail={"code": "OWNER_ONLY", "message": "Only the owner can rename this folder."},
        )

    result = await db.execute(select(Folder).where(Folder.id == folder_id))
    folder = result.scalar_one()
    folder.name = body.name
    await db.commit()
    await db.refresh(folder)

    # Get document count
    count_result = await db.execute(
        select(func.count(Document.id)).where(Document.folder_id == folder_id)
    )
    doc_count = count_result.scalar_one()

    return _folder_to_response(folder, "owner", doc_count)


@router.delete("/{folder_id}", status_code=204)
async def delete_folder(
    folder_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Delete a folder and all documents within it. Owner only."""
    permission = await resolve_folder_permission(db, folder_id, user_id)
    if permission is None:
        raise HTTPException(status_code=404, detail="Folder not found")
    if permission != "owner":
        raise HTTPException(
            status_code=403,
            detail={"code": "OWNER_ONLY", "message": "Only the owner can delete this folder."},
        )

    result = await db.execute(select(Folder).where(Folder.id == folder_id))
    folder = result.scalar_one()
    await db.delete(folder)
    await db.commit()
