from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, verify_internal_secret
from app.models.user import User
from app.schemas.internal import AuthValidateRequest, AuthValidateResponse
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

    # Document permission checking will be implemented in Step 7 (Sharing & Permissions).
    # For now, return owner permission for any valid user as a placeholder.
    return AuthValidateResponse(
        valid=True,
        user_id=user.id,
        display_name=user.display_name,
        permission="owner",
    )
