from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Index, Integer, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class Template(Base):
    __tablename__ = "templates"

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        server_default=text("generated always as identity"),
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    diagram_type: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Declared to match the DB schema created in migration 0003 so that
    # `alembic revision --autogenerate` sees it as already present.
    __table_args__ = (
        Index("idx_templates_type", "diagram_type"),
    )
