from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models import Base


class Folder(Base):
    __tablename__ = "folders"

    id: Mapped[int] = mapped_column(
        BigInteger, primary_key=True, server_default=text("generated always as identity")
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    owner_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    owner: Mapped["User"] = relationship(back_populates="folders")  # noqa: F821
    # cascade="all, delete-orphan" is consistent with the DB FK
    # `documents_folder_id_fkey ON DELETE CASCADE`: both mean "deleting a folder
    # deletes its documents". Move a document by setting the scalar
    # `Document.folder_id`, NOT by removing it from this collection — orphaning
    # it here would delete the document row.
    documents: Mapped[list["Document"]] = relationship(  # noqa: F821
        back_populates="folder", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("idx_folders_owner", "owner_id"),
    )
