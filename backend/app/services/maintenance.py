"""Periodic maintenance: reclaim orphaned content and prune stale token rows.

Runs from the app lifespan on a fixed interval. A Postgres advisory lock keeps
exactly one worker doing the work per cycle even with multiple uvicorn workers.
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings

logger = logging.getLogger(__name__)

# Arbitrary constant key for the maintenance advisory lock.
_ADVISORY_LOCK_KEY = 918273645


async def cleanup_expired_tokens(db: AsyncSession) -> int:
    """Delete refresh/reset tokens that expired or were revoked long enough ago.

    Reuse detection only needs revoked rows kept for a bounded window, so we
    retain them for ``token_retention_days`` and then delete.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.token_retention_days)

    refresh = await db.execute(
        text(
            "DELETE FROM refresh_tokens "
            "WHERE (revoked_at IS NOT NULL AND revoked_at < :cutoff) "
            "   OR (expires_at < :cutoff)"
        ),
        {"cutoff": cutoff},
    )
    reset = await db.execute(
        text(
            "DELETE FROM password_reset_tokens "
            "WHERE (used_at IS NOT NULL AND used_at < :cutoff) "
            "   OR (expires_at < :cutoff)"
        ),
        {"cutoff": cutoff},
    )
    return (refresh.rowcount or 0) + (reset.rowcount or 0)


async def gc_orphaned_content(db: AsyncSession) -> int:
    """Delete document_content rows no longer referenced by any version or by a
    document's current content. Content is content-addressed and shared, so it
    can't cascade on delete — without this the table grows forever."""
    result = await db.execute(
        text(
            "DELETE FROM document_content dc "
            "WHERE NOT EXISTS ("
            "  SELECT 1 FROM document_versions v WHERE v.content_hash = dc.content_hash"
            ") AND NOT EXISTS ("
            "  SELECT 1 FROM documents d WHERE d.current_content_hash = dc.content_hash"
            ")"
        )
    )
    return result.rowcount or 0


async def run_maintenance(db: AsyncSession) -> None:
    """Run one maintenance cycle if this worker wins the advisory lock."""
    got_lock = (
        await db.execute(
            text("SELECT pg_try_advisory_lock(:k)"), {"k": _ADVISORY_LOCK_KEY}
        )
    ).scalar_one()
    if not got_lock:
        return
    try:
        tokens = await cleanup_expired_tokens(db)
        content = await gc_orphaned_content(db)
        await db.commit()
        if tokens or content:
            logger.info(
                "Maintenance: pruned %d token rows, %d orphaned content rows",
                tokens,
                content,
            )
    finally:
        await db.execute(
            text("SELECT pg_advisory_unlock(:k)"), {"k": _ADVISORY_LOCK_KEY}
        )
        await db.commit()
