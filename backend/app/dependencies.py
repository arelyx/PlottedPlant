import uuid
from collections.abc import AsyncGenerator

import redis.asyncio as aioredis
from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.utils.security import decode_access_token

engine = create_async_engine(settings.database_url, echo=settings.app_env == "development")
async_session_factory = async_sessionmaker(engine, expire_on_commit=False)

redis_client = aioredis.from_url(settings.redis_url, decode_responses=True)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        yield session


async def get_redis() -> aioredis.Redis:
    return redis_client


async def get_current_user_id(request: Request) -> int:
    """Extract and validate user ID from JWT access token in Authorization header."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")

    token = auth_header[7:]  # Strip "Bearer "
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    try:
        return int(payload["sub"])
    except (KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token payload")


async def get_optional_user_id(request: Request) -> int | None:
    """Extract user ID from JWT if present, otherwise return None."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None

    token = auth_header[7:]
    payload = decode_access_token(token)
    if payload is None:
        return None

    try:
        return int(payload["sub"])
    except (KeyError, ValueError):
        return None


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
    if x_internal_secret != settings.internal_secret:
        raise HTTPException(status_code=401, detail="Invalid internal secret")


def parse_document_uuid(document_id: str) -> uuid.UUID:
    """Parse a document UUID string, returning 404 if invalid."""
    try:
        return uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Document not found")
