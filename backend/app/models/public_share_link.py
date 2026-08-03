import uuid

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func, text

from app.models import Base


class PublicShareLink(Base):
    __tablename__ = "public_share_links"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    document_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("documents.id", ondelete="CASCADE"), nullable=True
    )
    token: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, server_default=text("gen_random_uuid()")
    )
    permission: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'viewer'"))
    created_by_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("TRUE")
    )
    created_at: Mapped[str] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Declared to match the DB schema (migration 0004 created the table; 0006
    # added the unique token/document indexes; 0005/0007 tightened the check
    # constraints) so `alembic revision --autogenerate` sees them as already
    # present and does not stage spurious DROPs.
    __table_args__ = (
        CheckConstraint("permission = 'viewer'", name="ck_public_link_permission"),
        CheckConstraint("document_id IS NOT NULL", name="ck_public_link_target"),
        Index("idx_public_link_token_unique", "token", unique=True),
        Index(
            "uq_public_link_document",
            "document_id",
            unique=True,
            postgresql_where=text("document_id IS NOT NULL"),
        ),
    )
