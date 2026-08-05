import enum
from datetime import datetime, date, time

from sqlalchemy import String, Date, Time, DateTime, ForeignKey, func, Index, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class EstadoReserva(str, enum.Enum):
    ACTIVA = "activa"
    CANCELADA = "cancelada"
    COMPLETADA = "completada"
    NO_ASISTIO = "no_asistio"


class Reserva(Base):
    """Reserva con ciclo de vida por estados. La cancelación libera el horario."""
    __tablename__ = "reservas"
    __table_args__ = (
        # Unicidad para reservas ACTIVAS: impide la doble reserva del mismo slot (RF-18).
        # Índice único PARCIAL de PostgreSQL, aplicado solo cuando estado = 'activa'.
        Index(
            "uq_reserva_activa_slot",
            "agenda_id", "fecha", "hora_inicio",
            unique=True,
            postgresql_where=text("estado = 'activa'"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    agenda_id: Mapped[int] = mapped_column(ForeignKey("agendas.id"), index=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), index=True)
    fecha: Mapped[date] = mapped_column(Date, index=True)
    hora_inicio: Mapped[time] = mapped_column(Time)
    hora_fin: Mapped[time] = mapped_column(Time)
    estado: Mapped[str] = mapped_column(String(20), default=EstadoReserva.ACTIVA.value, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    cancelada_por: Mapped[str | None] = mapped_column(String(80), nullable=True)

    agenda = relationship("Agenda")
    usuario = relationship("Usuario")
