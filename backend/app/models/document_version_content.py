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
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class DocumentVersionContent(Base):
    """Snapshot + forward-delta content store (zstd payloads).

    Each row is either a ``full`` zstd snapshot (``base_id`` NULL, ``depth`` 0)
    or a ``delta`` compressed against its predecessor's plaintext as a
    raw-content dictionary (``base_id`` set, ``depth`` = base.depth + 1). The
    plaintext is reconstructed by walking ``base_id`` down to the full snapshot
    and decompressing forward. ``payload`` is opaque zstd bytes stored EXTERNAL
    so Postgres does not attempt to recompress it.
    """

    __tablename__ = "document_version_content"

    id: Mapped[int] = mapped_column(
        BigInteger, primary_key=True, server_default=text("generated always as identity")
    )
    document_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    base_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("document_version_content.id"), nullable=True
    )
    depth: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    payload: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    content_hash: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        CheckConstraint("kind IN ('full', 'delta')", name="ck_dvc_kind"),
        CheckConstraint(
            "(kind = 'full' AND base_id IS NULL) OR (kind = 'delta' AND base_id IS NOT NULL)",
            name="ck_dvc_kind_base",
        ),
        Index("idx_dvc_dedup", "document_id", "content_hash"),
        # Partial index created in migration 0012; declared here so autogenerate
        # sees it as already present.
        Index("idx_dvc_base", "base_id", postgresql_where=text("base_id IS NOT NULL")),
    )
