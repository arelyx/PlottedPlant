"""delta-chained version content storage

Revision ID: 0012
Revises: 0011
Create Date: 2026-08-03

Replaces the full-content-per-version store (``document_content``) with a
snapshot + forward-delta store (``document_version_content``) holding opaque
zstd payloads. ``document_versions`` now references a content entry by
``content_id`` (dropping its ``content_hash`` FK), and ``documents`` gains
``current_content_id`` pointing at the HEAD's content entry.

The old plaintext content cannot be losslessly re-encoded into the new format by
a data migration, so this drops the version/content history and truncates
documents. It touches ONLY documents, document_versions, document_content and
document_version_content — NEVER users, user_preferences, oauth_accounts,
refresh_tokens, password_reset_tokens, folders, or any auth table. ``TRUNCATE
documents CASCADE`` clears documents and their FK-dependent document_shares /
public_share_links only; users and folders are untouched.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0012"
down_revision: Union[str, None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Drop the old version metadata (removes its FK to document_content).
    op.drop_table("document_versions")

    # 2. Drop the old full-content store.
    op.drop_table("document_content")

    # 3. Nuke document data. Cascades to document_shares / public_share_links
    #    (both FK documents); users and folders are NOT touched.
    op.execute("TRUNCATE TABLE documents CASCADE")

    # 4. New snapshot + forward-delta content store.
    op.create_table(
        "document_version_content",
        sa.Column("id", sa.BigInteger, sa.Identity(always=True), primary_key=True),
        sa.Column(
            "document_id",
            sa.BigInteger,
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.Text, nullable=False),
        sa.Column(
            "base_id",
            sa.BigInteger,
            sa.ForeignKey("document_version_content.id"),
            nullable=True,
        ),
        sa.Column("depth", sa.Integer, nullable=False, server_default="0"),
        sa.Column("payload", sa.LargeBinary, nullable=False),
        sa.Column("content_hash", sa.LargeBinary, nullable=False),
        sa.Column("byte_size", sa.Integer, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint("kind IN ('full', 'delta')", name="ck_dvc_kind"),
        sa.CheckConstraint(
            "(kind = 'full' AND base_id IS NULL) OR (kind = 'delta' AND base_id IS NOT NULL)",
            name="ck_dvc_kind_base",
        ),
    )
    # Payload is already zstd-compressed — store it out-of-line, uncompressed,
    # so Postgres never wastes cycles trying to (re)compress it.
    op.execute(
        "ALTER TABLE document_version_content ALTER COLUMN payload SET STORAGE EXTERNAL"
    )
    op.create_index(
        "idx_dvc_dedup", "document_version_content", ["document_id", "content_hash"]
    )
    op.execute(
        "CREATE INDEX idx_dvc_base ON document_version_content (base_id) "
        "WHERE base_id IS NOT NULL"
    )
    op.execute(
        "ALTER TABLE document_version_content SET ("
        "    autovacuum_vacuum_scale_factor = 0.05,"
        "    autovacuum_analyze_scale_factor = 0.02"
        ")"
    )

    # 5. HEAD pointer into the delta-chain store (nullable: create_version
    #    populates it after the document row is flushed, same transaction).
    op.add_column(
        "documents", sa.Column("current_content_id", sa.BigInteger, nullable=True)
    )
    op.create_foreign_key(
        "documents_current_content_id_fkey",
        "documents",
        "document_version_content",
        ["current_content_id"],
        ["id"],
    )

    # 6. Recreate document_versions referencing content by id (no content_hash).
    op.create_table(
        "document_versions",
        sa.Column("id", sa.BigInteger, sa.Identity(always=True), primary_key=True),
        sa.Column(
            "document_id",
            sa.BigInteger,
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version_number", sa.Integer, nullable=False),
        sa.Column(
            "content_id",
            sa.BigInteger,
            sa.ForeignKey("document_version_content.id"),
            nullable=False,
        ),
        sa.Column(
            "created_by",
            sa.BigInteger,
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("label", sa.Text, nullable=True),
        sa.Column("source", sa.Text, nullable=False, server_default="auto"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("document_id", "version_number", name="uq_version_per_doc"),
        sa.CheckConstraint(
            "source IN ('auto', 'render', 'manual', 'restore', 'session_end')",
            name="ck_version_source",
        ),
    )
    # Pagination orders on version_number (strictly monotonic per doc), so that
    # is the index key — not created_at. The old covering index is intentionally
    # not recreated.
    op.execute(
        "CREATE INDEX idx_versions_doc_created "
        "ON document_versions (document_id, version_number DESC)"
    )
    op.execute(
        "CREATE INDEX idx_versions_brin_created "
        "ON document_versions USING BRIN (created_at) "
        "WITH (pages_per_range = 32)"
    )
    op.execute(
        "ALTER TABLE document_versions SET ("
        "    autovacuum_vacuum_scale_factor = 0.05,"
        "    autovacuum_analyze_scale_factor = 0.02"
        ")"
    )

    # 7. TOAST + heap autovacuum tuning for documents (HEAD text churns).
    op.execute(
        "ALTER TABLE documents SET ("
        "    autovacuum_vacuum_scale_factor = 0.05,"
        "    autovacuum_analyze_scale_factor = 0.02,"
        "    toast.autovacuum_vacuum_scale_factor = 0.05"
        ")"
    )


def downgrade() -> None:
    # Structural rollback only — history was already nuked on upgrade.
    op.drop_table("document_versions")
    op.drop_constraint(
        "documents_current_content_id_fkey", "documents", type_="foreignkey"
    )
    op.drop_column("documents", "current_content_id")
    op.drop_table("document_version_content")

    # Recreate the old content-addressable store.
    op.create_table(
        "document_content",
        sa.Column("content_hash", sa.LargeBinary, primary_key=True),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("byte_size", sa.Integer, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.execute("ALTER TABLE document_content ALTER COLUMN content SET COMPRESSION lz4")
    op.execute("ALTER TABLE document_content SET (toast_tuple_target = 128)")

    # Recreate the old version table (content_hash FK to document_content).
    op.create_table(
        "document_versions",
        sa.Column("id", sa.BigInteger, sa.Identity(always=True), primary_key=True),
        sa.Column(
            "document_id",
            sa.BigInteger,
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version_number", sa.Integer, nullable=False),
        sa.Column(
            "content_hash",
            sa.LargeBinary,
            sa.ForeignKey("document_content.content_hash"),
            nullable=False,
        ),
        sa.Column(
            "created_by",
            sa.BigInteger,
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("label", sa.Text, nullable=True),
        sa.Column("source", sa.Text, nullable=False, server_default="auto"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("document_id", "version_number", name="uq_version_per_doc"),
        sa.CheckConstraint(
            "source IN ('auto', 'render', 'manual', 'restore', 'session_end')",
            name="ck_version_source",
        ),
    )
    op.execute(
        "CREATE INDEX idx_versions_doc_created "
        "ON document_versions (document_id, created_at DESC)"
    )
    op.execute(
        "CREATE INDEX idx_versions_covering "
        "ON document_versions (document_id, created_at DESC) "
        "INCLUDE (version_number, content_hash, created_by, label, source)"
    )
    op.execute(
        "CREATE INDEX idx_versions_brin_created "
        "ON document_versions USING BRIN (created_at) "
        "WITH (pages_per_range = 32)"
    )
    op.execute(
        "ALTER TABLE document_versions SET ("
        "    autovacuum_vacuum_scale_factor = 0.05,"
        "    autovacuum_analyze_scale_factor = 0.02"
        ")"
    )
    op.execute(
        "ALTER TABLE document_content SET ("
        "    autovacuum_vacuum_scale_factor = 0.05,"
        "    autovacuum_analyze_scale_factor = 0.02"
        ")"
    )
