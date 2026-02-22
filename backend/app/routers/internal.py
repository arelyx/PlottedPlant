from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, verify_internal_secret
from app.models.document import Document
from app.models.user import User
from fastapi.responses import JSONResponse

from app.schemas.internal import (
    AuthValidateRequest,
    AuthValidateResponse,
    SessionEndResponse,
    SyncRequest,
    SyncResponse,
)
from app.services.document import (
    compute_content_hash,
    create_version,
    resolve_document_permission,
)
from app.utils.security import decode_access_token

router = APIRouter(
    prefix="/api/v1/internal",
    tags=["internal"],
    dependencies=[Depends(verify_internal_secret)],
)


@router.post("/auth/validate")
async def validate_auth(
    body: AuthValidateRequest,
    db: AsyncSession = Depends(get_db),
) -> AuthValidateResponse:
    """
    Validate a JWT token and check document permissions.
    Called by the Hocuspocus collaboration server.
    Returns 200 for both valid and invalid (inquiry pattern).
    """
    payload = decode_access_token(body.token)
    if payload is None:
        return AuthValidateResponse(valid=False, reason="Token expired or invalid")

    try:
        user_id = int(payload["sub"])
    except (KeyError, ValueError):
        return AuthValidateResponse(valid=False, reason="Invalid token payload")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        return AuthValidateResponse(valid=False, reason="User not found")

    # Check document permission
    permission = await resolve_document_permission(db, body.document_id, user_id)
    if permission is None:
        return AuthValidateResponse(valid=False, reason="No access to document")

    return AuthValidateResponse(
        valid=True,
        user_id=user.id,
        display_name=user.display_name,
        permission=permission,
    )


@router.get("/documents/{document_id}/content")
async def get_document_content(
    document_id: int,
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """Return document plain text for Hocuspocus onLoadDocument."""
    result = await db.execute(
        select(Document.current_content).where(Document.id == document_id)
    )
    row = result.one_or_none()
    if row is None:
        return JSONResponse(status_code=404, content={"error": "Document not found"})
    return JSONResponse(content={"content": row[0] or ""})


async def _sync_content(
    db: AsyncSession, document_id: int, content: str, user_id: int | None, source: str
) -> tuple[bool, int | None]:
    """Shared logic for sync and session-end: hash-compare, skip or create version."""
    result = await db.execute(
        select(Document).where(Document.id == document_id)
    )
    doc = result.scalar_one_or_none()
    if doc is None:
        return False, None

    content_hash, _ = compute_content_hash(content)
    if doc.current_content_hash == content_hash:
        return False, None

    # Fall back to document owner if no editor is known
    effective_user_id = user_id if user_id else doc.owner_id

    version_number = await create_version(
        db, document_id, content, effective_user_id, source=source
    )
    await db.commit()
    return True, version_number


@router.post("/documents/{document_id}/sync")
async def sync_document(
    document_id: int,
    body: SyncRequest,
    db: AsyncSession = Depends(get_db),
) -> SyncResponse:
    """Persist content from Hocuspocus periodic flush. Creates 'auto' version if changed."""
    created, version_number = await _sync_content(
        db, document_id, body.content, body.edited_by_user_id, "auto"
    )
    return SyncResponse(version_created=created, version_number=version_number)


@router.post("/documents/{document_id}/session-end")
async def session_end(
    document_id: int,
    body: SyncRequest,
    db: AsyncSession = Depends(get_db),
) -> SessionEndResponse:
    """Persist content when last collaborator disconnects. Creates 'session_end' version."""
    created, version_number = await _sync_content(
        db, document_id, body.content, body.edited_by_user_id, "session_end"
    )
    return SessionEndResponse(
        version_created=created,
        version_number=version_number,
        source="session_end" if created else None,
    )
