from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user_id, get_db
from app.models.document import Document
from app.models.folder import Folder
from app.schemas.document import (
    ContentUpdateResponse,
    DocumentContentUpdateRequest,
    DocumentCreateRequest,
    DocumentCreateResponse,
    DocumentDetailResponse,
    DocumentDuplicateRequest,
    DocumentListItem,
    DocumentListResponse,
    DocumentUpdateRequest,
)
from app.services.document import (
    compute_content_hash,
    create_version,
    get_document_with_permission,
    get_user_brief,
    resolve_folder_permission,
)

router = APIRouter(prefix="/api/v1/documents", tags=["documents"])

DEFAULT_CONTENT = "@startuml\n\n@enduml"


async def _validate_folder_ownership(db: AsyncSession, folder_id: int, user_id: int) -> Folder:
    """Validate that the user owns the given folder. Raises 404 if not found/not owned."""
    result = await db.execute(
        select(Folder).where(Folder.id == folder_id, Folder.owner_id == user_id)
    )
    folder = result.scalar_one_or_none()
    if folder is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "FOLDER_NOT_FOUND", "message": "Folder not found or you don't own it."},
        )
    return folder


def _build_list_item(doc: Document, permission: str, folder_info: dict | None, shared_by: dict | None, last_edited: dict | None) -> DocumentListItem:
    return DocumentListItem(
        id=doc.id,
        title=doc.title,
        folder=folder_info,
        permission=permission,
        is_shared=False,  # TODO (Step 7)
        last_edited_by=last_edited,
        shared_by=shared_by,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )


@router.get("", response_model=DocumentListResponse)
async def list_documents(
    folder_id: str | None = Query(None, description="Filter by folder ID or 'root'"),
    sort: str = Query("updated_at", pattern="^(title|updated_at|created_at)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    search: str | None = Query(None, description="Filter by title (case-insensitive)"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """List all documents visible to the authenticated user."""
    # Build base query — user's own documents (Step 7 adds shared docs)
    query = select(Document).where(Document.owner_id == user_id)

    # Filter by folder
    if folder_id == "root":
        query = query.where(Document.folder_id.is_(None))
    elif folder_id is not None:
        try:
            fid = int(folder_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid folder_id")
        query = query.where(Document.folder_id == fid)

    # Search filter
    if search:
        query = query.where(Document.title.ilike(f"%{search}%"))

    # Count total before pagination
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar_one()

    # Sort
    sort_cols = {"title": Document.title, "updated_at": Document.updated_at, "created_at": Document.created_at}
    sort_col = sort_cols[sort]
    query = query.order_by(sort_col.asc() if order == "asc" else sort_col.desc())

    # Pagination
    query = query.offset(offset).limit(limit)

    result = await db.execute(query)
    documents = result.scalars().all()

    # Batch-load folder info
    folder_ids = {d.folder_id for d in documents if d.folder_id is not None}
    folder_map = {}
    if folder_ids:
        folders_result = await db.execute(
            select(Folder.id, Folder.name).where(Folder.id.in_(folder_ids))
        )
        for fid, fname in folders_result.all():
            folder_map[fid] = {"id": fid, "name": fname}

    # Batch-load last_edited_by user info
    editor_ids = {d.last_edited_by for d in documents if d.last_edited_by is not None}
    editor_map = {}
    if editor_ids:
        from app.models.user import User
        editors_result = await db.execute(
            select(User.id, User.display_name).where(User.id.in_(editor_ids))
        )
        for uid, dname in editors_result.all():
            editor_map[uid] = {"id": uid, "display_name": dname}

    items = [
        _build_list_item(
            doc, "owner",
            folder_map.get(doc.folder_id) if doc.folder_id else None,
            None,
            editor_map.get(doc.last_edited_by) if doc.last_edited_by else None,
        )
        for doc in documents
    ]

    return DocumentListResponse(items=items, total=total, limit=limit, offset=offset)


@router.post("", response_model=DocumentCreateResponse, status_code=201)
async def create_document(
    body: DocumentCreateRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Create a new document."""
    folder = None
    folder_info = None

    # Validate folder ownership if specified
    if body.folder_id is not None:
        folder = await _validate_folder_ownership(db, body.folder_id, user_id)
        folder_info = {"id": folder.id, "name": folder.name}

    # Determine content
    content = body.content or DEFAULT_CONTENT
    # TODO (Step 5): If template_id provided, load template content

    title = body.title or "Untitled Diagram"
    content_hash, content_bytes = compute_content_hash(content)

    doc = Document(
        title=title,
        owner_id=user_id,
        folder_id=body.folder_id,
        current_content=content,
        current_content_hash=content_hash,
        last_edited_by=user_id,
    )
    db.add(doc)
    await db.flush()  # Get the ID without committing

    # Create initial version (version 1)
    version_number = await create_version(
        db, doc.id, content, user_id, source="manual"
    )

    await db.commit()
    await db.refresh(doc)

    return DocumentCreateResponse(
        id=doc.id,
        title=doc.title,
        folder=folder_info,
        permission="owner",
        is_shared=False,
        content=doc.current_content,
        version_number=version_number,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )


@router.get("/{document_id}", response_model=DocumentDetailResponse)
async def get_document(
    document_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get a single document's full details including content."""
    doc, permission = await get_document_with_permission(db, document_id, user_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")

    # Build folder info
    folder_info = None
    if doc.folder_id:
        folder_result = await db.execute(
            select(Folder.id, Folder.name).where(Folder.id == doc.folder_id)
        )
        row = folder_result.one_or_none()
        if row:
            folder_info = {"id": row.id, "name": row.name}

    # Owner info
    owner = await get_user_brief(db, doc.owner_id)

    # Last edited by
    last_edited = None
    if doc.last_edited_by:
        brief = await get_user_brief(db, doc.last_edited_by)
        if brief:
            last_edited = {"id": brief["id"], "display_name": brief["display_name"]}

    return DocumentDetailResponse(
        id=doc.id,
        title=doc.title,
        folder=folder_info,
        permission=permission,
        is_shared=False,  # TODO (Step 7)
        content=doc.current_content,
        version_number=doc.version_counter,
        owner=owner,
        last_edited_by=last_edited,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )


@router.patch("/{document_id}", response_model=DocumentDetailResponse)
async def update_document(
    document_id: int,
    body: DocumentUpdateRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Update document metadata (title, folder). Owner only."""
    doc, permission = await get_document_with_permission(db, document_id, user_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    if permission != "owner":
        raise HTTPException(
            status_code=403,
            detail={"code": "OWNER_ONLY", "message": "Only the owner can modify this document."},
        )

    if body.title is not None:
        doc.title = body.title

    if body.folder_id_provided:
        if body.folder_id is None:
            doc.folder_id = None  # Move to root
        else:
            await _validate_folder_ownership(db, body.folder_id, user_id)
            doc.folder_id = body.folder_id

    await db.commit()
    await db.refresh(doc)

    # Return full detail response (reuse get_document logic)
    return await get_document(document_id, user_id, db)


@router.delete("/{document_id}", status_code=204)
async def delete_document(
    document_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete a document. Owner only."""
    doc, permission = await get_document_with_permission(db, document_id, user_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    if permission != "owner":
        raise HTTPException(
            status_code=403,
            detail={"code": "OWNER_ONLY", "message": "Only the owner can delete this document."},
        )

    await db.delete(doc)
    await db.commit()


@router.post("/{document_id}/duplicate", response_model=DocumentCreateResponse, status_code=201)
async def duplicate_document(
    document_id: int,
    body: DocumentDuplicateRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Duplicate a document to the authenticated user's workspace."""
    doc, permission = await get_document_with_permission(db, document_id, user_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")

    # Validate target folder if specified
    folder_info = None
    if body.folder_id is not None:
        folder = await _validate_folder_ownership(db, body.folder_id, user_id)
        folder_info = {"id": folder.id, "name": folder.name}

    title = body.title or f"{doc.title} (Copy)"
    content = doc.current_content
    content_hash, content_bytes = compute_content_hash(content)

    new_doc = Document(
        title=title,
        owner_id=user_id,
        folder_id=body.folder_id,
        current_content=content,
        current_content_hash=content_hash,
        last_edited_by=user_id,
    )
    db.add(new_doc)
    await db.flush()

    version_number = await create_version(
        db, new_doc.id, content, user_id, source="manual"
    )

    await db.commit()
    await db.refresh(new_doc)

    return DocumentCreateResponse(
        id=new_doc.id,
        title=new_doc.title,
        folder=folder_info,
        permission="owner",
        is_shared=False,
        content=new_doc.current_content,
        version_number=version_number,
        created_at=new_doc.created_at,
        updated_at=new_doc.updated_at,
    )


@router.put("/{document_id}/content", response_model=ContentUpdateResponse)
async def update_content(
    document_id: int,
    body: DocumentContentUpdateRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Update document content directly via REST."""
    doc, permission = await get_document_with_permission(db, document_id, user_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    if permission == "viewer":
        raise HTTPException(
            status_code=403,
            detail={"code": "READ_ONLY", "message": "You have read-only access to this document."},
        )

    content_hash, content_bytes = compute_content_hash(body.content)

    # Check if content has changed
    if doc.current_content_hash == content_hash:
        return ContentUpdateResponse(
            version_number=doc.version_counter,
            content_hash=content_hash.hex(),
            created_version=False,
        )

    # Content changed — create new version
    version_number = await create_version(
        db, document_id, body.content, user_id, source="auto"
    )
    await db.commit()

    return ContentUpdateResponse(
        version_number=version_number,
        content_hash=content_hash.hex(),
        created_version=True,
    )
