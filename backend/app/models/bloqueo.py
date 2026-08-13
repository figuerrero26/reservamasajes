from datetime import date, time, datetime

from sqlalchemy import String, Date, Time, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class Bloqueo(Base):
    """Bloqueo de un día completo o de un rango horario.

    agenda_id nulo => el bloqueo aplica a todas las agendas.
    tipo: 'dia' | 'rango'
    """
    __tablename__ = "bloqueos"

    id: Mapped[int] = mapped_column(primary_key=True)
    agenda_id: Mapped[int | None] = mapped_column(ForeignKey("agendas.id"), nullable=True, index=True)
    tipo: Mapped[str] = mapped_column(String(10))
    fecha: Mapped[date] = mapped_column(Date, index=True)
    hora_inicio: Mapped[time | None] = mapped_column(Time, nullable=True)
    hora_fin: Mapped[time | None] = mapped_column(Time, nullable=True)
    motivo: Mapped[str | None] = mapped_column(String(255), nullable=True)
    creado_por: Mapped[int | None] = mapped_column(ForeignKey("administradores.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    administrador = relationship("Administrador")
