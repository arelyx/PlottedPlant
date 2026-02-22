import logging

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import get_current_user, get_current_user_id, get_db
from app.models.user import User
from app.schemas.auth import (
    AuthResponse,
    EmailVerifyRequest,
    LoginRequest,
    MessageResponse,
    PasswordChangeRequest,
    PasswordForgotRequest,
    PasswordResetRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)
from app.services.auth import (
    create_password_reset_token,
    create_refresh_token,
    create_user,
    find_user_by_email,
    find_user_by_username,
    revoke_all_user_tokens,
    revoke_refresh_token,
    rotate_refresh_token,
    validate_and_consume_reset_token,
)
from app.utils.security import (
    create_access_token,
    hash_password,
    verify_password,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

REFRESH_COOKIE_NAME = "refresh_token"


def _set_refresh_cookie(response: Response, token: str) -> None:
    """Set the refresh token as an HTTP-only cookie."""
    secure = settings.app_env != "development"
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=secure,
        samesite="strict",
        path="/api/v1/auth",
        max_age=settings.jwt_refresh_token_expire_days * 86400,
    )


def _clear_refresh_cookie(response: Response) -> None:
    """Clear the refresh token cookie."""
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        path="/api/v1/auth",
    )


@router.post("/register", status_code=201)
async def register(
    body: RegisterRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    # Check uniqueness
    if await find_user_by_email(db, body.email):
        raise HTTPException(
            status_code=409,
            detail={"code": "EMAIL_TAKEN", "message": "An account with this email already exists."},
        )
    if await find_user_by_username(db, body.username):
        raise HTTPException(
            status_code=409,
            detail={
                "code": "USERNAME_TAKEN",
                "message": "This username is already taken.",
            },
        )

    user = await create_user(db, body.email, body.username, body.display_name, body.password)
    access_token, expires_in = create_access_token(user.id)
    raw_refresh = await create_refresh_token(db, user.id)
    await db.commit()

    _set_refresh_cookie(response, raw_refresh)

    # TODO: send verification email asynchronously (Step 2 enhancement or deferred)

    return AuthResponse(
        user=UserResponse.model_validate(user),
        access_token=access_token,
        expires_in=expires_in,
    )


@router.post("/login")
async def login(
    body: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    user = await find_user_by_email(db, body.email)

    if user is None:
        raise HTTPException(
            status_code=401,
            detail={"code": "INVALID_CREDENTIALS", "message": "Invalid email or password."},
        )

    if user.password_hash is None:
        raise HTTPException(
            status_code=401,
            detail={
                "code": "OAUTH_ONLY_ACCOUNT",
                "message": "This account uses OAuth login. Please sign in with your OAuth provider.",
            },
        )

    if not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=401,
            detail={"code": "INVALID_CREDENTIALS", "message": "Invalid email or password."},
        )

    access_token, expires_in = create_access_token(user.id)
    raw_refresh = await create_refresh_token(db, user.id)
    await db.commit()

    _set_refresh_cookie(response, raw_refresh)

    return AuthResponse(
        user=UserResponse.model_validate(user),
        access_token=access_token,
        expires_in=expires_in,
    )


@router.post("/refresh")
async def refresh(
    response: Response,
    db: AsyncSession = Depends(get_db),
    refresh_token: str | None = Cookie(None, alias=REFRESH_COOKIE_NAME),
) -> TokenResponse:
    if refresh_token is None:
        raise HTTPException(
            status_code=401,
            detail={"code": "INVALID_REFRESH_TOKEN", "message": "No refresh token provided."},
        )

    result = await rotate_refresh_token(db, refresh_token)
    if result is None:
        _clear_refresh_cookie(response)
        raise HTTPException(
            status_code=401,
            detail={
                "code": "INVALID_REFRESH_TOKEN",
                "message": "Invalid, expired, or revoked refresh token.",
            },
        )

    user, new_raw_token = result
    access_token, expires_in = create_access_token(user.id)
    await db.commit()

    _set_refresh_cookie(response, new_raw_token)

    return TokenResponse(access_token=access_token, expires_in=expires_in)


@router.post("/logout", status_code=204)
async def logout(
    response: Response,
    db: AsyncSession = Depends(get_db),
    _user_id: int = Depends(get_current_user_id),
    refresh_token: str | None = Cookie(None, alias=REFRESH_COOKIE_NAME),
):
    if refresh_token:
        await revoke_refresh_token(db, refresh_token)
        await db.commit()

    _clear_refresh_cookie(response)
    return None


@router.post("/logout-all", status_code=204)
async def logout_all(
    response: Response,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    await revoke_all_user_tokens(db, user_id)
    await db.commit()

    _clear_refresh_cookie(response)
    return None


@router.post("/password/forgot")
async def password_forgot(
    body: PasswordForgotRequest,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    # Always return the same response to prevent email enumeration
    user = await find_user_by_email(db, body.email)
    if user is not None:
        raw_token = await create_password_reset_token(db, user.id)
        await db.commit()
        # TODO: send password reset email with raw_token
        logger.info("Password reset token created for user %s", user.id)

    return MessageResponse(
        message="If an account with that email exists, a password reset link has been sent."
    )


@router.post("/password/reset")
async def password_reset(
    body: PasswordResetRequest,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    user = await validate_and_consume_reset_token(db, body.token)
    if user is None:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "INVALID_RESET_TOKEN",
                "message": "This reset link is invalid, expired, or has already been used.",
            },
        )

    user.password_hash = hash_password(body.new_password)

    # Revoke all refresh tokens (log out all sessions)
    await revoke_all_user_tokens(db, user.id)
    await db.commit()

    return MessageResponse(message="Password has been reset successfully.")


@router.post("/password/change")
async def password_change(
    body: PasswordChangeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    if user.password_hash is None:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "NO_PASSWORD",
                "message": "This account does not have a password set. Use OAuth to sign in.",
            },
        )

    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(
            status_code=401,
            detail={"code": "INVALID_CREDENTIALS", "message": "Current password is incorrect."},
        )

    user.password_hash = hash_password(body.new_password)
    await db.commit()

    return MessageResponse(message="Password changed successfully.")


@router.post("/email/verify")
async def email_verify(
    body: EmailVerifyRequest,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    # Email verification uses the same token pattern as password reset
    # For now, this is a placeholder — full implementation requires
    # email verification tokens (separate table or reuse password_reset_tokens)
    # TODO: implement email verification token validation
    raise HTTPException(
        status_code=400,
        detail={
            "code": "INVALID_VERIFICATION_TOKEN",
            "message": "Invalid or expired verification token.",
        },
    )


@router.post("/email/resend-verification")
async def resend_verification(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    if user.is_email_verified:
        return MessageResponse(message="Email is already verified.")

    # TODO: generate verification token and send email
    logger.info("Verification email resend requested for user %s", user.id)

    return MessageResponse(message="Verification email sent.")
