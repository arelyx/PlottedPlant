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
    can't cascade on delete — without this the table grows forever.

    A plain "DELETE ... WHERE NOT EXISTS (...)" is racy: a concurrent
    create_version can insert a document_versions row referencing a
    content_hash in between our NOT EXISTS check and the actual delete,
    which then fails the FK constraint and aborts the whole transaction.

    To close that window we first select the candidate rows with
    "FOR UPDATE SKIP LOCKED" in a CTE, then delete exactly those rows in the
    same statement. Locking a document_content row this way blocks (rather
    than races) a concurrent INSERT into document_versions that references
    it, because Postgres's FK trigger takes a FOR KEY SHARE lock on the
    referenced row — so once we hold FOR UPDATE, no new reference can be
    added until our transaction ends. Rows already referenced/locked by a
    concurrent writer are simply skipped this cycle rather than raced; a
    skipped row that's genuinely orphaned will be collected on the next
    cycle instead.
    """
    result = await db.execute(
        text(
            "WITH candidates AS ("
            "  SELECT dc.content_hash FROM document_content dc "
            "  WHERE NOT EXISTS ("
            "    SELECT 1 FROM document_versions v WHERE v.content_hash = dc.content_hash"
            "  ) AND NOT EXISTS ("
            "    SELECT 1 FROM documents d WHERE d.current_content_hash = dc.content_hash"
            "  )"
            "  FOR UPDATE SKIP LOCKED"
            ") "
            "DELETE FROM document_content "
            "WHERE content_hash IN (SELECT content_hash FROM candidates)"
        )
    )
    return result.rowcount or 0


async def run_maintenance(db: AsyncSession) -> None:
    """Run one maintenance cycle if this worker wins the advisory lock.

    The lock is transaction-scoped (pg_try_advisory_xact_lock), acquired and
    released within a single transaction alongside the GC delete and its
    commit. Postgres releases a transaction-scoped advisory lock
    automatically on COMMIT *or* ROLLBACK, so there is no separate unlock
    step that can fail while the connection is stuck in an
    aborted-transaction state -- the lock cannot leak even if
    gc_orphaned_content's delete aborts the transaction.
    """
    try:
        got_lock = (
            await db.execute(
                text("SELECT pg_try_advisory_xact_lock(:k)"), {"k": _ADVISORY_LOCK_KEY}
            )
        ).scalar_one()
        if not got_lock:
            # Another worker holds the lock this cycle. Nothing to do, but
            # end the transaction we just (implicitly) started.
            await db.rollback()
            return

        content = await gc_orphaned_content(db)
        await db.commit()
        if content:
            logger.info("Maintenance: reclaimed %d orphaned content rows", content)
    except Exception:
        # Roll back so the xact-scoped advisory lock releases along with
        # the aborted transaction instead of leaking. The next cycle
        # retries from scratch.
        await db.rollback()
        raise
