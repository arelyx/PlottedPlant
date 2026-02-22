"""add document and folder tables

Revision ID: 0002
Revises: 0001
Create Date: 2026-02-22

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- folders ---
    op.create_table(
        "folders",
        sa.Column("id", sa.BigInteger, sa.Identity(always=True), primary_key=True),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("owner_id", sa.BigInteger, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("idx_folders_owner", "folders", ["owner_id"])

    # --- document_content (content-addressable store) ---
    op.create_table(
        "document_content",
        sa.Column("content_hash", sa.LargeBinary, primary_key=True),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("byte_size", sa.Integer, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    # LZ4 compression + early TOAST out-of-line
    op.execute("ALTER TABLE document_content ALTER COLUMN content SET COMPRESSION lz4")
    op.execute("ALTER TABLE document_content SET (toast_tuple_target = 128)")

    # --- documents ---
    op.create_table(
        "documents",
        sa.Column("id", sa.BigInteger, sa.Identity(always=True), primary_key=True),
        sa.Column("title", sa.Text, nullable=False, server_default="Untitled Diagram"),
        sa.Column("owner_id", sa.BigInteger, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("folder_id", sa.BigInteger, sa.ForeignKey("folders.id", ondelete="SET NULL"), nullable=True),
        sa.Column(
            "current_content", sa.Text, nullable=False,
            server_default=sa.text("'@startuml' || E'\\n\\n' || '@enduml'"),
        ),
        sa.Column("current_content_hash", sa.LargeBinary, nullable=False),
        sa.Column("last_edited_by", sa.BigInteger, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("version_counter", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    # LZ4 compression + early TOAST out-of-line for content column
    op.execute("ALTER TABLE documents ALTER COLUMN current_content SET COMPRESSION lz4")
    op.execute("ALTER TABLE documents SET (toast_tuple_target = 128)")

    op.create_index("idx_documents_owner", "documents", ["owner_id"])
    # Partial index: only index documents that belong to a folder
    op.execute(
        "CREATE INDEX idx_documents_folder ON documents (folder_id) WHERE folder_id IS NOT NULL"
    )

    # --- document_versions ---
    op.create_table(
        "document_versions",
        sa.Column("id", sa.BigInteger, sa.Identity(always=True), primary_key=True),
        sa.Column("document_id", sa.BigInteger, sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_number", sa.Integer, nullable=False),
        sa.Column("content_hash", sa.LargeBinary, sa.ForeignKey("document_content.content_hash"), nullable=False),
        sa.Column("created_by", sa.BigInteger, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("label", sa.Text, nullable=True),
        sa.Column("source", sa.Text, nullable=False, server_default="auto"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("document_id", "version_number", name="uq_version_per_doc"),
        sa.CheckConstraint(
            "source IN ('auto', 'render', 'manual', 'restore', 'session_end')",
            name="ck_version_source",
        ),
    )

    # Primary query index: all versions for document, most recent first
    op.execute(
        "CREATE INDEX idx_versions_doc_created "
        "ON document_versions (document_id, created_at DESC)"
    )

    # Covering index for version listing without heap access
    op.execute(
        "CREATE INDEX idx_versions_covering "
        "ON document_versions (document_id, created_at DESC) "
        "INCLUDE (version_number, content_hash, created_by, label, source)"
    )

    # BRIN index for time-range queries (admin/analytics)
    op.execute(
        "CREATE INDEX idx_versions_brin_created "
        "ON document_versions USING BRIN (created_at) "
        "WITH (pages_per_range = 32)"
    )

    # Autovacuum tuning for append-only tables
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


def downgrade() -> None:
    op.drop_table("document_versions")
    op.drop_table("documents")
    op.drop_table("document_content")
    op.drop_table("folders")
