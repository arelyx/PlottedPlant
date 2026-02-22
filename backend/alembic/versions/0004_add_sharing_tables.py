"""add sharing tables

Revision ID: 0004
Revises: 0003
Create Date: 2026-02-22

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- document_shares ---
    op.create_table(
        "document_shares",
        sa.Column("id", sa.BigInteger, sa.Identity(always=True), primary_key=True),
        sa.Column(
            "document_id",
            sa.BigInteger,
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "shared_with_id",
            sa.BigInteger,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("permission", sa.Text, nullable=False),
        sa.Column(
            "shared_by_id",
            sa.BigInteger,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("document_id", "shared_with_id", name="uq_doc_share_user"),
        sa.CheckConstraint(
            "permission IN ('editor', 'viewer')", name="ck_doc_share_permission"
        ),
    )
    op.create_index("idx_doc_shares_user", "document_shares", ["shared_with_id"])
    op.create_index("idx_doc_shares_doc", "document_shares", ["document_id"])

    # --- folder_shares ---
    op.create_table(
        "folder_shares",
        sa.Column("id", sa.BigInteger, sa.Identity(always=True), primary_key=True),
        sa.Column(
            "folder_id",
            sa.BigInteger,
            sa.ForeignKey("folders.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "shared_with_id",
            sa.BigInteger,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("permission", sa.Text, nullable=False),
        sa.Column(
            "shared_by_id",
            sa.BigInteger,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("folder_id", "shared_with_id", name="uq_folder_share_user"),
        sa.CheckConstraint(
            "permission IN ('editor', 'viewer')", name="ck_folder_share_permission"
        ),
    )
    op.create_index("idx_folder_shares_user", "folder_shares", ["shared_with_id"])
    op.create_index("idx_folder_shares_folder", "folder_shares", ["folder_id"])

    # --- public_share_links ---
    op.create_table(
        "public_share_links",
        sa.Column("id", sa.BigInteger, sa.Identity(always=True), primary_key=True),
        sa.Column(
            "document_id",
            sa.BigInteger,
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "folder_id",
            sa.BigInteger,
            sa.ForeignKey("folders.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "token",
            sa.dialects.postgresql.UUID(as_uuid=True),
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("permission", sa.Text, nullable=False),
        sa.Column(
            "created_by_id",
            sa.BigInteger,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("TRUE")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "permission IN ('editor', 'viewer')", name="ck_public_link_permission"
        ),
        sa.CheckConstraint(
            "(document_id IS NOT NULL AND folder_id IS NULL) OR "
            "(document_id IS NULL AND folder_id IS NOT NULL)",
            name="ck_public_link_target",
        ),
    )
    # Unique token for active links
    op.create_index(
        "idx_public_link_token_active",
        "public_share_links",
        ["token"],
        unique=True,
        postgresql_where=sa.text("is_active = TRUE"),
    )


def downgrade() -> None:
    op.drop_table("public_share_links")
    op.drop_table("folder_shares")
    op.drop_table("document_shares")
