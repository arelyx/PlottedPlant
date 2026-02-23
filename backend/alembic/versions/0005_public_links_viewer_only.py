"""restrict public share links to viewer only

Revision ID: 0005
Revises: 0004
Create Date: 2026-02-22

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Convert any existing editor public links to viewer
    op.execute("UPDATE public_share_links SET permission = 'viewer' WHERE permission = 'editor'")

    # Tighten check constraint to only allow 'viewer'
    op.drop_constraint("ck_public_link_permission", "public_share_links", type_="check")
    op.create_check_constraint(
        "ck_public_link_permission", "public_share_links", "permission = 'viewer'"
    )

    # Add server default so permission column is always 'viewer'
    op.alter_column(
        "public_share_links",
        "permission",
        server_default=sa.text("'viewer'"),
    )


def downgrade() -> None:
    # Remove server default
    op.alter_column(
        "public_share_links",
        "permission",
        server_default=None,
    )

    # Restore original constraint that allows both editor and viewer
    op.drop_constraint("ck_public_link_permission", "public_share_links", type_="check")
    op.create_check_constraint(
        "ck_public_link_permission",
        "public_share_links",
        "permission IN ('editor', 'viewer')",
    )
