from sqlalchemy import BigInteger, DateTime, ForeignKey, Identity, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.models import Base


class FolderShare(Base):
    __tablename__ = "folder_shares"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    folder_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("folders.id", ondelete="CASCADE"), nullable=False
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
