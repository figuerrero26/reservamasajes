from datetime import datetime

from sqlalchemy import String, Integer, JSON, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class Auditoria(Base):
    """Bitácora de acciones administrativas. No se elimina desde la interfaz normal."""
    __tablename__ = "auditoria"

    id: Mapped[int] = mapped_column(primary_key=True)
    admin_id: Mapped[int | None] = mapped_column(ForeignKey("administradores.id"), nullable=True, index=True)
    accion: Mapped[str] = mapped_column(String(80))
    entidad: Mapped[str | None] = mapped_column(String(60), nullable=True)
    entidad_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    datos_anteriores: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    datos_nuevos: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
