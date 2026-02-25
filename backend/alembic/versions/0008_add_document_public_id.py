"""add public_id UUID column to documents

Revision ID: 0008
Revises: 0007
Create Date: 2026-02-25

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add nullable UUID column with default
    op.add_column(
        "documents",
        sa.Column(
            "public_id",
            UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=True,
        ),
    )

    # 2. Backfill existing rows
    op.execute("UPDATE documents SET public_id = gen_random_uuid() WHERE public_id IS NULL")

    # 3. Set NOT NULL
    op.alter_column("documents", "public_id", nullable=False)

    # 4. Create unique index
    op.create_index(
        "idx_documents_public_id",
        "documents",
        ["public_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("idx_documents_public_id", table_name="documents")
    op.drop_column("documents", "public_id")
