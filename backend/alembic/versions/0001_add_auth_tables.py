"""add auth tables

Revision ID: 0001
Revises:
Create Date: 2026-02-22

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. users ──
    op.create_table(
        "users",
        sa.Column(
            "id",
            sa.BigInteger,
            sa.Identity(always=True),
            primary_key=True,
        ),
        sa.Column("email", sa.Text, nullable=False),
        sa.Column("username", sa.Text, nullable=False),
        sa.Column("display_name", sa.Text, nullable=False),
        sa.Column("password_hash", sa.Text, nullable=True),
        sa.Column("avatar_url", sa.Text, nullable=True),
        sa.Column(
            "is_email_verified",
            sa.Boolean,
            nullable=False,
            server_default="false",
        ),
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
        sa.UniqueConstraint("email", name="uq_users_email"),
        sa.UniqueConstraint("username", name="uq_users_username"),
        sa.CheckConstraint(
            r"email ~* '^[^@]+@[^@]+\.[^@]+$'", name="ck_users_email_format"
        ),
        sa.CheckConstraint(
            r"username ~ '^[a-zA-Z0-9_-]{3,30}$'",
            name="ck_users_username_format",
        ),
    )

    # Functional indexes for case-insensitive uniqueness
    op.execute(
        "CREATE UNIQUE INDEX idx_users_username_lower ON users (LOWER(username))"
    )
    op.execute(
        "CREATE UNIQUE INDEX idx_users_email_lower ON users (LOWER(email))"
    )
    # Prefix search indexes for sharing dialog
    op.execute(
        "CREATE INDEX idx_users_search ON users (LOWER(username) text_pattern_ops)"
    )
    op.execute(
        "CREATE INDEX idx_users_email_search ON users (LOWER(email) text_pattern_ops)"
    )

    # ── 2. oauth_accounts ──
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

    # ── 3. refresh_tokens ──
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
        sa.UniqueConstraint("token_hash", name="uq_refresh_token_hash"),
    )
    # Partial indexes for active tokens only
    op.execute(
        "CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id) "
        "WHERE revoked_at IS NULL"
    )
    op.execute(
        "CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens (expires_at) "
        "WHERE revoked_at IS NULL"
    )

    # ── 4. password_reset_tokens ──
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

    # ── 5. user_preferences ──
    op.create_table(
        "user_preferences",
        sa.Column(
            "user_id",
            sa.BigInteger,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("theme", sa.Text, nullable=False, server_default="system"),
        sa.Column("editor_font_size", sa.Integer, nullable=False, server_default="14"),
        sa.Column(
            "editor_minimap", sa.Boolean, nullable=False, server_default="false"
        ),
        sa.Column(
            "editor_word_wrap", sa.Boolean, nullable=False, server_default="true"
        ),
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
        sa.CheckConstraint(
            "theme IN ('light', 'dark', 'system')", name="ck_prefs_theme"
        ),
        sa.CheckConstraint(
            "editor_font_size BETWEEN 8 AND 32", name="ck_prefs_font_size"
        ),
    )


def downgrade() -> None:
    op.drop_table("user_preferences")
    op.drop_table("password_reset_tokens")
    op.drop_table("refresh_tokens")
    op.drop_table("oauth_accounts")
    op.drop_table("users")
