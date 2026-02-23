from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user_id, get_db
from app.models.document import Document
from app.models.document_share import DocumentShare
from app.models.folder import Folder
from app.models.folder_share import FolderShare
from app.models.public_share_link import PublicShareLink
from app.models.user import User
from app.schemas.share import (
    CreatePublicLinkRequest,
    CreateShareRequest,
    PublicLinkResponse,
    ShareListResponse,
    ShareResponse,
    ShareUser,
    UpdateShareRequest,
)
from app.services.document import resolve_document_permission, resolve_folder_permission

router = APIRouter(prefix="/api/v1", tags=["sharing"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_share_user(db: AsyncSession, user_id: int) -> ShareUser:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return ShareUser(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        email=user.email,
        avatar_url=user.avatar_url,
    )


def _build_public_link_response(link: PublicShareLink) -> PublicLinkResponse:
    return PublicLinkResponse(
        token=str(link.token),
        permission=link.permission,
        is_active=link.is_active,
        url=f"/share/{link.token}",
        created_at=link.created_at,
    )


# ---------------------------------------------------------------------------
# Document Shares
# ---------------------------------------------------------------------------

@router.get("/documents/{document_id}/shares", response_model=ShareListResponse)
async def list_document_shares(
    document_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """List all shares for a document. Owner only."""
    permission = await resolve_document_permission(db, document_id, user_id)
    if permission is None:
        raise HTTPException(status_code=404, detail="Document not found")
    if permission != "owner":
        raise HTTPException(
            status_code=403,
            detail={"code": "OWNER_ONLY", "message": "Only the owner can view shares."},
        )

    result = await db.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one()

    owner_user = await _get_share_user(db, doc.owner_id)

    # Get shares
    shares_result = await db.execute(
        select(DocumentShare).where(DocumentShare.document_id == document_id)
    )
    shares = shares_result.scalars().all()

    share_responses = []
    for s in shares:
        share_user = await _get_share_user(db, s.shared_with_id)
        share_responses.append(ShareResponse(
            id=s.id,
            user=share_user,
            permission=s.permission,
            created_at=s.created_at,
        ))

    # Get public link (active or inactive — permanent UUID)
    link_result = await db.execute(
        select(PublicShareLink).where(
            PublicShareLink.document_id == document_id,
        )
    )
    link = link_result.scalar_one_or_none()

    return ShareListResponse(
        owner=owner_user,
        shares=share_responses,
        public_link=_build_public_link_response(link) if link else None,
    )


@router.post(
    "/documents/{document_id}/shares",
    response_model=ShareResponse,
    status_code=201,
)
async def create_document_share(
    document_id: int,
    body: CreateShareRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Share a document with a user. Owner only."""
    permission = await resolve_document_permission(db, document_id, user_id)
    if permission is None:
        raise HTTPException(status_code=404, detail="Document not found")
    if permission != "owner":
        raise HTTPException(
            status_code=403,
            detail={"code": "OWNER_ONLY", "message": "Only the owner can share."},
        )

    # Cannot share with self
    if body.user_id == user_id:
        raise HTTPException(
            status_code=400,
            detail={"code": "CANNOT_SHARE_WITH_SELF", "message": "Cannot share with yourself."},
        )

    # Target user must exist
    target_result = await db.execute(select(User).where(User.id == body.user_id))
    target_user = target_result.scalar_one_or_none()
    if target_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Check for existing share
    existing = await db.execute(
        select(DocumentShare).where(
            DocumentShare.document_id == document_id,
            DocumentShare.shared_with_id == body.user_id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=409,
            detail={"code": "ALREADY_SHARED", "message": "Already shared with this user. Use PATCH to update."},
        )

    share = DocumentShare(
        document_id=document_id,
        shared_with_id=body.user_id,
        permission=body.permission,
        shared_by_id=user_id,
    )
    db.add(share)
    await db.commit()
    await db.refresh(share)

    share_user = ShareUser(
        id=target_user.id,
        username=target_user.username,
        display_name=target_user.display_name,
        email=target_user.email,
        avatar_url=target_user.avatar_url,
    )

    return ShareResponse(
        id=share.id,
        user=share_user,
        permission=share.permission,
        created_at=share.created_at,
    )


@router.patch("/documents/{document_id}/shares/{share_id}", response_model=ShareResponse)
async def update_document_share(
    document_id: int,
    share_id: int,
    body: UpdateShareRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Update a document share permission. Owner only."""
    permission = await resolve_document_permission(db, document_id, user_id)
    if permission is None:
        raise HTTPException(status_code=404, detail="Document not found")
    if permission != "owner":
        raise HTTPException(
            status_code=403,
            detail={"code": "OWNER_ONLY", "message": "Only the owner can modify shares."},
        )

    result = await db.execute(
        select(DocumentShare).where(
            DocumentShare.id == share_id,
            DocumentShare.document_id == document_id,
        )
    )
    share = result.scalar_one_or_none()
    if share is None:
        raise HTTPException(status_code=404, detail="Share not found")

    share.permission = body.permission
    await db.commit()
    await db.refresh(share)

    share_user = await _get_share_user(db, share.shared_with_id)
    return ShareResponse(
        id=share.id,
        user=share_user,
        permission=share.permission,
        created_at=share.created_at,
    )


@router.delete("/documents/{document_id}/shares/{share_id}", status_code=204)
async def delete_document_share(
    document_id: int,
    share_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Remove a document share. Owner only."""
    permission = await resolve_document_permission(db, document_id, user_id)
    if permission is None:
        raise HTTPException(status_code=404, detail="Document not found")
    if permission != "owner":
        raise HTTPException(
            status_code=403,
            detail={"code": "OWNER_ONLY", "message": "Only the owner can remove shares."},
        )

    result = await db.execute(
        select(DocumentShare).where(
            DocumentShare.id == share_id,
            DocumentShare.document_id == document_id,
        )
    )
    share = result.scalar_one_or_none()
    if share is None:
        raise HTTPException(status_code=404, detail="Share not found")

    await db.delete(share)
    await db.commit()


# ---------------------------------------------------------------------------
# Folder Shares
# ---------------------------------------------------------------------------

@router.get("/folders/{folder_id}/shares", response_model=ShareListResponse)
async def list_folder_shares(
    folder_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """List all shares for a folder. Owner only."""
    permission = await resolve_folder_permission(db, folder_id, user_id)
    if permission is None:
        raise HTTPException(status_code=404, detail="Folder not found")
    if permission != "owner":
        raise HTTPException(
            status_code=403,
            detail={"code": "OWNER_ONLY", "message": "Only the owner can view shares."},
        )

    result = await db.execute(select(Folder).where(Folder.id == folder_id))
    folder = result.scalar_one()

    owner_user = await _get_share_user(db, folder.owner_id)

    shares_result = await db.execute(
        select(FolderShare).where(FolderShare.folder_id == folder_id)
    )
    shares = shares_result.scalars().all()

    share_responses = []
    for s in shares:
        share_user = await _get_share_user(db, s.shared_with_id)
        share_responses.append(ShareResponse(
            id=s.id,
            user=share_user,
            permission=s.permission,
            created_at=s.created_at,
        ))

    return ShareListResponse(
        owner=owner_user,
        shares=share_responses,
        public_link=None,
    )


@router.post(
    "/folders/{folder_id}/shares",
    response_model=ShareResponse,
    status_code=201,
)
async def create_folder_share(
    folder_id: int,
    body: CreateShareRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Share a folder with a user. Owner only."""
    permission = await resolve_folder_permission(db, folder_id, user_id)
    if permission is None:
        raise HTTPException(status_code=404, detail="Folder not found")
    if permission != "owner":
        raise HTTPException(
            status_code=403,
            detail={"code": "OWNER_ONLY", "message": "Only the owner can share."},
        )

    if body.user_id == user_id:
        raise HTTPException(
            status_code=400,
            detail={"code": "CANNOT_SHARE_WITH_SELF", "message": "Cannot share with yourself."},
        )

    target_result = await db.execute(select(User).where(User.id == body.user_id))
    target_user = target_result.scalar_one_or_none()
    if target_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    existing = await db.execute(
        select(FolderShare).where(
            FolderShare.folder_id == folder_id,
            FolderShare.shared_with_id == body.user_id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=409,
            detail={"code": "ALREADY_SHARED", "message": "Already shared with this user. Use PATCH to update."},
        )

    share = FolderShare(
        folder_id=folder_id,
        shared_with_id=body.user_id,
        permission=body.permission,
        shared_by_id=user_id,
    )
    db.add(share)
    await db.commit()
    await db.refresh(share)

    share_user = ShareUser(
        id=target_user.id,
        username=target_user.username,
        display_name=target_user.display_name,
        email=target_user.email,
        avatar_url=target_user.avatar_url,
    )

    return ShareResponse(
        id=share.id,
        user=share_user,
        permission=share.permission,
        created_at=share.created_at,
    )


@router.patch("/folders/{folder_id}/shares/{share_id}", response_model=ShareResponse)
async def update_folder_share(
    folder_id: int,
    share_id: int,
    body: UpdateShareRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Update a folder share permission. Owner only."""
    permission = await resolve_folder_permission(db, folder_id, user_id)
    if permission is None:
        raise HTTPException(status_code=404, detail="Folder not found")
    if permission != "owner":
        raise HTTPException(
            status_code=403,
            detail={"code": "OWNER_ONLY", "message": "Only the owner can modify shares."},
        )

    result = await db.execute(
        select(FolderShare).where(
            FolderShare.id == share_id,
            FolderShare.folder_id == folder_id,
        )
    )
    share = result.scalar_one_or_none()
    if share is None:
        raise HTTPException(status_code=404, detail="Share not found")

    share.permission = body.permission
    await db.commit()
    await db.refresh(share)

    share_user = await _get_share_user(db, share.shared_with_id)
    return ShareResponse(
        id=share.id,
        user=share_user,
        permission=share.permission,
        created_at=share.created_at,
    )


@router.delete("/folders/{folder_id}/shares/{share_id}", status_code=204)
async def delete_folder_share(
    folder_id: int,
    share_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Remove a folder share. Owner only."""
    permission = await resolve_folder_permission(db, folder_id, user_id)
    if permission is None:
        raise HTTPException(status_code=404, detail="Folder not found")
    if permission != "owner":
        raise HTTPException(
            status_code=403,
            detail={"code": "OWNER_ONLY", "message": "Only the owner can remove shares."},
        )

    result = await db.execute(
        select(FolderShare).where(
            FolderShare.id == share_id,
            FolderShare.folder_id == folder_id,
        )
    )
    share = result.scalar_one_or_none()
    if share is None:
        raise HTTPException(status_code=404, detail="Share not found")

    await db.delete(share)
    await db.commit()


# ---------------------------------------------------------------------------
# Document Public Links
# ---------------------------------------------------------------------------

@router.post("/documents/{document_id}/public-link", response_model=PublicLinkResponse)
async def create_document_public_link(
    document_id: int,
    body: CreatePublicLinkRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Activate or create a public link for a document. Owner only.

    Each document has at most one permanent public link. If one exists
    (active or inactive), it is reactivated. Otherwise a new one is created.
    """
    permission = await resolve_document_permission(db, document_id, user_id)
    if permission is None:
        raise HTTPException(status_code=404, detail="Document not found")
    if permission != "owner":
        raise HTTPException(
            status_code=403,
            detail={"code": "OWNER_ONLY", "message": "Only the owner can manage public links."},
        )

    # Check for existing link (active or inactive)
    existing_result = await db.execute(
        select(PublicShareLink).where(
            PublicShareLink.document_id == document_id,
        )
    )
    existing = existing_result.scalar_one_or_none()

    if existing is not None:
        existing.is_active = True
        await db.commit()
        await db.refresh(existing)
        return _build_public_link_response(existing)

    # First time — create new permanent link
    link = PublicShareLink(
        document_id=document_id,
        permission="viewer",
        created_by_id=user_id,
    )
    db.add(link)
    await db.commit()
    await db.refresh(link)
    return _build_public_link_response(link)


@router.delete("/documents/{document_id}/public-link", status_code=204)
async def revoke_document_public_link(
    document_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Deactivate the public link for a document. Owner only."""
    permission = await resolve_document_permission(db, document_id, user_id)
    if permission is None:
        raise HTTPException(status_code=404, detail="Document not found")
    if permission != "owner":
        raise HTTPException(
            status_code=403,
            detail={"code": "OWNER_ONLY", "message": "Only the owner can manage public links."},
        )

    result = await db.execute(
        select(PublicShareLink).where(
            PublicShareLink.document_id == document_id,
        )
    )
    link = result.scalar_one_or_none()
    if link is None:
        raise HTTPException(status_code=404, detail="No public link exists")

    link.is_active = False
    await db.commit()


# ---------------------------------------------------------------------------
# Public Share Access (No auth required)
# ---------------------------------------------------------------------------

@router.get("/share/{token}")
async def access_public_link(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """Access a resource via a public share link. No authentication required."""
    result = await db.execute(
        select(PublicShareLink).where(
            PublicShareLink.token == token,
            PublicShareLink.is_active.is_(True),
        )
    )
    link = result.scalar_one_or_none()
    if link is None:
        raise HTTPException(status_code=404, detail="Link not found or has been revoked")

    doc_result = await db.execute(
        select(Document).where(Document.id == link.document_id)
    )
    doc = doc_result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")

    # Get owner info
    owner_result = await db.execute(
        select(User.display_name).where(User.id == doc.owner_id)
    )
    owner_name = owner_result.scalar_one_or_none() or "Unknown"

    return {
        "type": "document",
        "permission": "viewer",
        "document": {
            "id": doc.id,
            "title": doc.title,
            "content": doc.current_content,
            "owner": {"display_name": owner_name},
            "updated_at": doc.updated_at.isoformat() if doc.updated_at else None,
        },
    }
