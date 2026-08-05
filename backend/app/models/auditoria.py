from datetime import datetime

from sqlalchemy import String, Integer, Text, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class Auditoria(Base):
    """Bitácora de acciones administrativas (RF-20)."""
    __tablename__ = "auditoria"

    id: Mapped[int] = mapped_column(primary_key=True)
    actor: Mapped[str] = mapped_column(String(80), index=True)
    accion: Mapped[str] = mapped_column(String(80))
    entidad: Mapped[str | None] = mapped_column(String(60), nullable=True)
    entidad_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    detalle: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
