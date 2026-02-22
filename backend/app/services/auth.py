from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.password_reset_token import PasswordResetToken
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.utils.security import (
    create_access_token,
    generate_token,
    hash_password,
    hash_token,
    verify_password,
)


async def find_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(
        select(User).where(func.lower(User.email) == email.lower())
    )
    return result.scalar_one_or_none()


async def find_user_by_username(db: AsyncSession, username: str) -> User | None:
    result = await db.execute(
        select(User).where(func.lower(User.username) == username.lower())
    )
    return result.scalar_one_or_none()


async def create_user(
    db: AsyncSession,
    email: str,
    username: str,
    display_name: str,
    password: str,
) -> User:
    user = User(
        email=email,
        username=username,
        display_name=display_name,
        password_hash=hash_password(password),
        is_email_verified=False,
    )
    db.add(user)
    await db.flush()
    return user


async def create_refresh_token(db: AsyncSession, user_id: int) -> str:
    """Create a refresh token. Returns the raw token (for the cookie)."""
    raw_token = generate_token()
    token_hash = hash_token(raw_token)
    expires_at = datetime.now(timezone.utc) + timedelta(
        days=settings.jwt_refresh_token_expire_days
    )

    refresh = RefreshToken(
        user_id=user_id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    db.add(refresh)
    await db.flush()
    return raw_token


async def rotate_refresh_token(db: AsyncSession, raw_token: str) -> tuple[User, str] | None:
    """
    Validate and rotate a refresh token. Returns (user, new_raw_token) or None.
    Implements reuse detection: if a revoked token is presented, the entire
    token family for that user is revoked.
    """
    token_hash = hash_token(raw_token)

    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    old_token = result.scalar_one_or_none()

    if old_token is None:
        return None

    # Reuse detection: revoked token presented → revoke all user tokens
    if old_token.revoked_at is not None:
        await db.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == old_token.user_id)
            .where(RefreshToken.revoked_at.is_(None))
            .values(revoked_at=func.now())
        )
        await db.commit()
        return None

    # Check expiry
    if old_token.expires_at < datetime.now(timezone.utc):
        return None

    # Rotate: revoke old, create new
    new_raw_token = generate_token()
    new_token_hash = hash_token(new_raw_token)
    expires_at = datetime.now(timezone.utc) + timedelta(
        days=settings.jwt_refresh_token_expire_days
    )

    new_refresh = RefreshToken(
        user_id=old_token.user_id,
        token_hash=new_token_hash,
        expires_at=expires_at,
    )
    db.add(new_refresh)
    await db.flush()

    old_token.revoked_at = datetime.now(timezone.utc)
    old_token.replaced_by_id = new_refresh.id
    await db.flush()

    # Load user
    user_result = await db.execute(
        select(User).where(User.id == old_token.user_id)
    )
    user = user_result.scalar_one_or_none()
    if user is None:
        return None

    return user, new_raw_token


async def revoke_refresh_token(db: AsyncSession, raw_token: str) -> bool:
    """Revoke a single refresh token. Returns True if found and revoked."""
    token_hash = hash_token(raw_token)
    result = await db.execute(
        select(RefreshToken)
        .where(RefreshToken.token_hash == token_hash)
        .where(RefreshToken.revoked_at.is_(None))
    )
    token = result.scalar_one_or_none()
    if token is None:
        return False

    token.revoked_at = datetime.now(timezone.utc)
    await db.flush()
    return True


async def revoke_all_user_tokens(db: AsyncSession, user_id: int) -> None:
    """Revoke all active refresh tokens for a user."""
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id)
        .where(RefreshToken.revoked_at.is_(None))
        .values(revoked_at=func.now())
    )
    await db.flush()


async def create_password_reset_token(db: AsyncSession, user_id: int) -> str:
    """Create a password reset token. Returns the raw token (for email)."""
    raw_token = generate_token()
    token_hash = hash_token(raw_token)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)

    reset = PasswordResetToken(
        user_id=user_id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    db.add(reset)
    await db.flush()
    return raw_token


async def validate_and_consume_reset_token(
    db: AsyncSession, raw_token: str
) -> User | None:
    """Validate and consume a password reset token. Returns the user or None."""
    token_hash = hash_token(raw_token)
    now = datetime.now(timezone.utc)

    result = await db.execute(
        select(PasswordResetToken)
        .where(PasswordResetToken.token_hash == token_hash)
        .where(PasswordResetToken.used_at.is_(None))
        .where(PasswordResetToken.expires_at > now)
    )
    reset_token = result.scalar_one_or_none()
    if reset_token is None:
        return None

    # Mark as used
    reset_token.used_at = now

    # Invalidate all other active reset tokens for this user
    await db.execute(
        update(PasswordResetToken)
        .where(PasswordResetToken.user_id == reset_token.user_id)
        .where(PasswordResetToken.id != reset_token.id)
        .where(PasswordResetToken.used_at.is_(None))
        .values(used_at=now)
    )

    await db.flush()

    # Load user
    user_result = await db.execute(
        select(User).where(User.id == reset_token.user_id)
    )
    return user_result.scalar_one_or_none()
