import uuid

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Identity, Text
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
    folder_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("folders.id", ondelete="CASCADE"), nullable=True
    )
    token: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, server_default=text("gen_random_uuid()")
    )
    permission: Mapped[str] = mapped_column(Text, nullable=False)
    created_by_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("TRUE")
    )
    created_at: Mapped[str] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
