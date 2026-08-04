import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Integer, LargeBinary, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models import Base


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(
        BigInteger, primary_key=True, server_default=text("generated always as identity")
    )
    public_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, server_default=text("gen_random_uuid()")
    )
    title: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="Untitled Diagram"
    )
    owner_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # ON DELETE CASCADE matches the ORM `Folder.documents` relationship
    # (cascade="all, delete-orphan"): deleting a folder deletes its documents
    # via both the ORM path and any raw SQL / FK-driven delete. To MOVE a
    # document between folders, set this scalar `folder_id` (as the routers do)
    # — never detach it from the `Folder.documents` collection, or delete-orphan
    # will silently delete the row.
    folder_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("folders.id", ondelete="CASCADE"), nullable=True
    )
    current_content: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'@startuml' || E'\\n\\n' || '@enduml'")
    )
    current_content_hash: Mapped[bytes] = mapped_column(
        LargeBinary, nullable=False
    )
    # Points at the HEAD's content entry in the delta-chain store. Nullable so a
    # freshly-inserted document can flush before create_version populates it in
    # the same transaction. `current_content` (above) remains the full HEAD text
    # for O(1) editor loads — this column is only for chaining new deltas.
    current_content_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("document_version_content.id"), nullable=True
    )
    last_edited_by: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    version_counter: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    owner: Mapped["User"] = relationship(  # noqa: F821
        foreign_keys=[owner_id], back_populates="owned_documents"
    )
    last_editor: Mapped["User | None"] = relationship(  # noqa: F821
        foreign_keys=[last_edited_by]
    )
    folder: Mapped["Folder | None"] = relationship(back_populates="documents")  # noqa: F821
    versions: Mapped[list["DocumentVersion"]] = relationship(  # noqa: F821
        back_populates="document", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("idx_documents_owner", "owner_id"),
        Index("idx_documents_folder", "folder_id", postgresql_where=text("folder_id IS NOT NULL")),
        Index("idx_documents_public_id", "public_id", unique=True),
    )
