from datetime import datetime, timezone

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_redis

router = APIRouter(prefix="/api/v1/health", tags=["health"])


@router.get("")
async def health_check():
    return {
        "status": "healthy",
        "version": "1.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/detailed")
async def health_check_detailed(
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    dependencies = {}

    # Check PostgreSQL
    try:
        await db.execute(text("SELECT 1"))
        dependencies["database"] = "connected"
    except Exception:
        dependencies["database"] = "disconnected"

    # Check Redis
    try:
        await redis.ping()
        dependencies["redis"] = "connected"
    except Exception:
        dependencies["redis"] = "disconnected"

    overall = "healthy" if all(v == "connected" for v in dependencies.values()) else "degraded"

    return {
        "status": overall,
        "version": "1.0.0",
        "dependencies": dependencies,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
