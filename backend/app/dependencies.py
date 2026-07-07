import asyncio
import hmac
import uuid
from collections.abc import AsyncGenerator

import redis.asyncio as aioredis
from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.utils.clerk import get_or_provision_user, verify_clerk_token

engine = create_async_engine(settings.database_url, echo=settings.app_env == "development")
async_session_factory = async_sessionmaker(engine, expire_on_commit=False)

redis_client = aioredis.from_url(settings.redis_url, decode_responses=True)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        yield session


async def get_redis() -> aioredis.Redis:
    return redis_client


def _bearer_token(request: Request) -> str | None:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    return auth_header[7:]


async def get_current_user_id(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> int:
    """Resolve the local user id from a Clerk session token, provisioning the
    user on first sight. Raises 401 if the token is missing or invalid."""
    token = _bearer_token(request)
    if token is None:
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")

    claims = await asyncio.to_thread(verify_clerk_token, token)
    if claims is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = await get_or_provision_user(db, claims)
    return user.id


async def get_optional_user_id(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> int | None:
    """Like get_current_user_id but returns None instead of raising when there
    is no valid token (for endpoints that work anonymously)."""
    token = _bearer_token(request)
    if token is None:
        return None

    claims = await asyncio.to_thread(verify_clerk_token, token)
    if claims is None:
        return None

    user = await get_or_provision_user(db, claims)
    return user.id


async def get_current_user(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get the full User object for the authenticated user."""
    from app.models.user import User

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def verify_internal_secret(
    x_internal_secret: str = Header(..., alias="X-Internal-Secret"),
) -> None:
    """Verify the X-Internal-Secret header for internal endpoints."""
    if not hmac.compare_digest(x_internal_secret, settings.internal_secret):
        raise HTTPException(status_code=401, detail="Invalid internal secret")


def parse_document_uuid(document_id: str) -> uuid.UUID:
    """Parse a document UUID string, returning 404 if invalid."""
    try:
        return uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Document not found")
