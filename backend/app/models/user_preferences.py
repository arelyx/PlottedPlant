from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models import Base


class UserPreferences(Base):
    __tablename__ = "user_preferences"

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    theme: Mapped[str] = mapped_column(Text, nullable=False, server_default="system")
    editor_font_size: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="14"
    )
    editor_minimap: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    editor_word_wrap: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    user: Mapped["User"] = relationship(back_populates="preferences")

    __table_args__ = (
        CheckConstraint("theme IN ('light', 'dark', 'system')", name="ck_prefs_theme"),
        CheckConstraint("editor_font_size BETWEEN 8 AND 32", name="ck_prefs_font_size"),
    )
