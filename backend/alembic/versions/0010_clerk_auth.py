"""migrate auth to Clerk: add clerk_user_id, drop password/token tables

Revision ID: 0010
Revises: 0009
Create Date: 2026-07-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Map Clerk subjects to local users. Unique constraint (NULLs are distinct
    # in Postgres, so pre-wipe rows with NULL don't collide).
    op.add_column("users", sa.Column("clerk_user_id", sa.Text(), nullable=True))
    op.create_unique_constraint("uq_users_clerk_user_id", "users", ["clerk_user_id"])

    # Credentials now live in Clerk — drop the local password + the custom
    # session/reset/OAuth machinery entirely.
    op.drop_column("users", "password_hash")
    op.drop_table("password_reset_tokens")
    op.drop_table("refresh_tokens")
    op.drop_table("oauth_accounts")


def downgrade() -> None:
    op.add_column("users", sa.Column("password_hash", sa.Text(), nullable=True))
    op.drop_constraint("uq_users_clerk_user_id", "users", type_="unique")
    op.drop_column("users", "clerk_user_id")
    # Note: the dropped tables are not recreated here — restore from 0001-0002
    # migrations if a full rollback is required.
