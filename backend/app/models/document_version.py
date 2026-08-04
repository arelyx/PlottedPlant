from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models import Base


class DocumentVersion(Base):
    __tablename__ = "document_versions"

    id: Mapped[int] = mapped_column(
        BigInteger, primary_key=True, server_default=text("generated always as identity")
    )
    document_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    content_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("document_version_content.id"), nullable=False
    )
    created_by: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    label: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(Text, nullable=False, server_default="auto")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    document: Mapped["Document"] = relationship(back_populates="versions")  # noqa: F821
    creator: Mapped["User | None"] = relationship(foreign_keys=[created_by])  # noqa: F821

    __table_args__ = (
        UniqueConstraint("document_id", "version_number", name="uq_version_per_doc"),
        CheckConstraint(
            "source IN ('auto', 'render', 'manual', 'restore', 'session_end')",
            name="ck_version_source",
        ),
        # Complex indexes (DESC, BRIN) created in migration 0012. Declared here
        # to match the DB exactly so `alembic revision --autogenerate` sees them
        # as already present (no spurious DROPs). Pagination is on
        # version_number (strictly monotonic per doc), so that is the ordered
        # key — not created_at. The old covering index was dropped in 0012.
        Index("idx_versions_doc_created", "document_id", text("version_number DESC")),
        Index(
            "idx_versions_brin_created",
            "created_at",
            postgresql_using="brin",
            postgresql_with={"pages_per_range": "32"},
        ),
    )
