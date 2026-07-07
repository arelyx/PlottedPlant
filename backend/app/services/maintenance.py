"""Periodic maintenance: reclaim orphaned content and prune stale token rows.

Runs from the app lifespan on a fixed interval. A Postgres advisory lock keeps
exactly one worker doing the work per cycle even with multiple uvicorn workers.
"""

import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Arbitrary constant key for the maintenance advisory lock.
_ADVISORY_LOCK_KEY = 918273645


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
        content = await gc_orphaned_content(db)
        await db.commit()
        if content:
            logger.info("Maintenance: reclaimed %d orphaned content rows", content)
    finally:
        await db.execute(
            text("SELECT pg_advisory_unlock(:k)"), {"k": _ADVISORY_LOCK_KEY}
        )
        await db.commit()
