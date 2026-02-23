"""enforce one permanent public link per document/folder

Revision ID: 0006
Revises: 0005
Create Date: 2026-02-22

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Clean up duplicate rows: keep only the most recent (highest id) per document
    op.execute(
        "DELETE FROM public_share_links a "
        "USING public_share_links b "
        "WHERE a.document_id IS NOT NULL "
        "AND a.document_id = b.document_id "
        "AND a.id < b.id"
    )
    # Same for folders
    op.execute(
        "DELETE FROM public_share_links a "
        "USING public_share_links b "
        "WHERE a.folder_id IS NOT NULL "
        "AND a.folder_id = b.folder_id "
        "AND a.id < b.id"
    )

    # 2. Drop old partial unique index on token (only covered active links)
    op.drop_index("idx_public_link_token_active", table_name="public_share_links")

    # 3. Create global unique index on token (covers all rows)
    op.create_index(
        "idx_public_link_token_unique",
        "public_share_links",
        ["token"],
        unique=True,
    )

    # 4. Enforce one link per document
    op.create_index(
        "uq_public_link_document",
        "public_share_links",
        ["document_id"],
        unique=True,
        postgresql_where=sa.text("document_id IS NOT NULL"),
    )

    # 5. Enforce one link per folder
    op.create_index(
        "uq_public_link_folder",
        "public_share_links",
        ["folder_id"],
        unique=True,
        postgresql_where=sa.text("folder_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_public_link_folder", table_name="public_share_links")
    op.drop_index("uq_public_link_document", table_name="public_share_links")
    op.drop_index("idx_public_link_token_unique", table_name="public_share_links")

    # Restore original partial unique index
    op.create_index(
        "idx_public_link_token_active",
        "public_share_links",
        ["token"],
        unique=True,
        postgresql_where=sa.text("is_active = TRUE"),
    )
