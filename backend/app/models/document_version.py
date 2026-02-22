from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
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
    content_hash: Mapped[bytes] = mapped_column(
        LargeBinary, ForeignKey("document_content.content_hash"), nullable=False
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
        # Complex indexes (DESC, covering, BRIN) are created in the migration
    )
