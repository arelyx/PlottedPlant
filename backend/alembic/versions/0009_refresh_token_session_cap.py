"""add absolute session expiry to refresh tokens

Revision ID: 0009
Revises: 0008
Create Date: 2026-07-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Absolute end of a login session, carried unchanged through rotation so a
    # session can't slide forever. Nullable: legacy rows have no cap.
    op.add_column(
        "refresh_tokens",
        sa.Column("session_expires_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("refresh_tokens", "session_expires_at")
