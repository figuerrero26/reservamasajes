import enum
from datetime import datetime, date, time

from sqlalchemy import String, Date, Time, DateTime, ForeignKey, Text, func, Index, Computed
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class EstadoReserva(str, enum.Enum):
    ACTIVA = "activa"
    CANCELADA = "cancelada"
    COMPLETADA = "completada"
    NO_ASISTIO = "no_asistio"


class Reserva(Base):
    """Reserva con ciclo de vida por estados. La cancelación libera el horario.

    Control de concurrencia en MariaDB: `slot_lock` es una columna generada que vale 'A'
    únicamente cuando estado='activa' y NULL en cualquier otro caso. MariaDB no soporta
    índices únicos parciales/condicionales como PostgreSQL, pero sí trata cada NULL como
    distinto dentro de un índice único (igual que MySQL/InnoDB). El mismo `slot_lock` se
    reutiliza en DOS índices únicos:

    - `(agenda_id, fecha, hora_inicio, slot_lock)`: nunca dos reservas activas para el
      mismo horario exacto.
    - `(usuario_id, servicio_id, fecha, slot_lock)`: nunca dos reservas activas del mismo
      usuario para el mismo evento el mismo día (sin importar la hora ni el área/agenda).

    `servicio_id` está desnormalizado desde `agenda.servicio_id` (se copia al crear la
    reserva) porque una columna generada / un índice solo puede referenciar columnas de la
    propia tabla, no de una tabla relacionada.
    """
    __tablename__ = "reservas"
    __table_args__ = (
        Index(
            "uq_reserva_activa_slot",
            "agenda_id", "fecha", "hora_inicio", "slot_lock",
            unique=True,
        ),
        Index(
            "uq_reserva_activa_evento_dia",
            "usuario_id", "servicio_id", "fecha", "slot_lock",
            unique=True,
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    agenda_id: Mapped[int] = mapped_column(ForeignKey("agendas.id"), index=True)
    servicio_id: Mapped[int] = mapped_column(ForeignKey("servicios.id"), index=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), index=True)
    fecha: Mapped[date] = mapped_column(Date, index=True)
    hora_inicio: Mapped[time] = mapped_column(Time)
    hora_fin: Mapped[time] = mapped_column(Time)
    estado: Mapped[str] = mapped_column(String(20), default=EstadoReserva.ACTIVA.value, index=True)
    slot_lock: Mapped[str | None] = mapped_column(
        String(1), Computed("IF(estado = 'activa', 'A', NULL)", persisted=True)
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    cancelled_by: Mapped[str | None] = mapped_column(String(80), nullable=True)

    agenda = relationship("Agenda")
    servicio = relationship("Servicio")
    usuario = relationship("Usuario")
