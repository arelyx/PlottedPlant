from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.models import Base


class DocumentShare(Base):
    __tablename__ = "document_shares"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    document_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    shared_with_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    permission: Mapped[str] = mapped_column(Text, nullable=False)
    shared_by_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[str] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Declared to match the DB schema created in migration 0004 so that
    # `alembic revision --autogenerate` sees them as already present and does
    # not stage spurious DROPs.
    __table_args__ = (
        UniqueConstraint("document_id", "shared_with_id", name="uq_doc_share_user"),
        CheckConstraint(
            "permission IN ('editor', 'viewer')", name="ck_doc_share_permission"
        ),
        Index("idx_doc_shares_user", "shared_with_id"),
        Index("idx_doc_shares_doc", "document_id"),
    )
