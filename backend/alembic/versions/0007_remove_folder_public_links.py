"""remove folder public share links

Revision ID: 0007
Revises: 0006
Create Date: 2026-02-22

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Delete all folder public links
    op.execute("DELETE FROM public_share_links WHERE folder_id IS NOT NULL")

    # 2. Drop the per-folder unique index (created in 0006)
    op.drop_index("uq_public_link_folder", table_name="public_share_links")

    # 3. Replace the XOR check constraint before dropping the column
    #    (dropping folder_id would cascade-remove the constraint)
    op.drop_constraint("ck_public_link_target", "public_share_links", type_="check")
    op.create_check_constraint(
        "ck_public_link_target",
        "public_share_links",
        "document_id IS NOT NULL",
    )

    # 4. Drop the folder_id column (now safe — no constraint references it)
    op.drop_column("public_share_links", "folder_id")


def downgrade() -> None:
    # Remove the new constraint
    op.drop_constraint("ck_public_link_target", "public_share_links", type_="check")

    # Re-add folder_id column
    op.add_column(
        "public_share_links",
        sa.Column(
            "folder_id",
            sa.BigInteger,
            sa.ForeignKey("folders.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )

    # Restore the XOR check constraint
    op.create_check_constraint(
        "ck_public_link_target",
        "public_share_links",
        "(document_id IS NOT NULL AND folder_id IS NULL) OR "
        "(document_id IS NULL AND folder_id IS NOT NULL)",
    )

    # Restore the per-folder unique index
    op.create_index(
        "uq_public_link_folder",
        "public_share_links",
        ["folder_id"],
        unique=True,
        postgresql_where=sa.text("folder_id IS NOT NULL"),
    )
