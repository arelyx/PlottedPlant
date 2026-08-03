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
    # Precise inverse of upgrade(): recreate the tables dropped above (in the
    # reverse order they were dropped) exactly as they existed at the 0009
    # schema state, so the earlier migrations' downgrades (e.g. 0009 dropping
    # refresh_tokens.session_expires_at) operate on tables that exist.

    # ── oauth_accounts (from 0001) ──
    op.create_table(
        "oauth_accounts",
        sa.Column(
            "id",
            sa.BigInteger,
            sa.Identity(always=True),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            sa.BigInteger,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("provider", sa.Text, nullable=False),
        sa.Column("provider_user_id", sa.Text, nullable=False),
        sa.Column("provider_email", sa.Text, nullable=True),
        sa.Column("access_token", sa.Text, nullable=True),
        sa.Column("refresh_token", sa.Text, nullable=True),
        sa.Column("token_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "provider", "provider_user_id", name="uq_oauth_provider_user"
        ),
        sa.CheckConstraint(
            "provider IN ('google', 'github')", name="ck_oauth_provider"
        ),
    )
    op.create_index("idx_oauth_user_id", "oauth_accounts", ["user_id"])

    # ── refresh_tokens (from 0001, incl. 0009's session_expires_at) ──
    op.create_table(
        "refresh_tokens",
        sa.Column(
            "id",
            sa.BigInteger,
            sa.Identity(always=True),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            sa.BigInteger,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.LargeBinary, nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "replaced_by_id",
            sa.BigInteger,
            sa.ForeignKey("refresh_tokens.id"),
            nullable=True,
        ),
        # Added by 0009; present in the 0009 schema state that 0009.downgrade
        # expects to drop.
        sa.Column("session_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("token_hash", name="uq_refresh_token_hash"),
    )
    op.execute(
        "CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id) "
        "WHERE revoked_at IS NULL"
    )
    op.execute(
        "CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens (expires_at) "
        "WHERE revoked_at IS NULL"
    )

    # ── password_reset_tokens (from 0001) ──
    op.create_table(
        "password_reset_tokens",
        sa.Column(
            "id",
            sa.BigInteger,
            sa.Identity(always=True),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            sa.BigInteger,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.LargeBinary, nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("token_hash", name="uq_reset_token_hash"),
    )
    op.create_index("idx_reset_tokens_user", "password_reset_tokens", ["user_id"])

    # ── restore local password + drop the Clerk mapping column ──
    op.add_column("users", sa.Column("password_hash", sa.Text(), nullable=True))
    op.drop_constraint("uq_users_clerk_user_id", "users", type_="unique")
    op.drop_column("users", "clerk_user_id")
