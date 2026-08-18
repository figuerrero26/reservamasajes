import enum
from datetime import datetime, date, time

from sqlalchemy import String, Boolean, Date, Time, DateTime, ForeignKey, Text, func, Index, Computed
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
      mismo horario exacto. Esta nunca tiene excepción: dos personas (o la misma dos veces)
      jamás pueden ocupar el mismo turno exacto.
    - `(usuario_id, servicio_id, fecha, slot_lock_evento_dia)`: nunca dos reservas activas
      del mismo usuario para el mismo evento el mismo día — salvo que el usuario tenga
      habilitada la excepción `usuarios.permite_reservas_multiples`. Esta regla usa una
      columna generada APARTE (`slot_lock_evento_dia`, no `slot_lock`) precisamente para
      poder desactivarla sin afectar la regla anterior: `permite_multiple_evento_dia` es
      una foto de `usuario.permite_reservas_multiples` tomada al crear la reserva (una
      columna generada solo puede leer columnas de su propia fila, nunca de otra tabla).

    `servicio_id` está desnormalizado desde `agenda.servicio_id` (se copia al crear la
    reserva) porque una columna generada / un índice solo puede referenciar columnas de la
    propia tabla, no de una tabla relacionada.

    `usuario_nombre`/`usuario_apellido`/`usuario_correo` son una foto de la identidad del
    colaborador tomada al crear la reserva (igual idea que `servicio_id`). Esto permite que
    un administrador pueda **eliminar** una cuenta de colaborador (ver UsuarioService.eliminar)
    sin romper el historial: `usuario_id` queda en NULL (ON DELETE SET NULL) pero la reserva
    conserva quién la hizo. Las reservas futuras y activas se cancelan antes de eliminar la
    cuenta; las que ya pasaron se dejan tal cual, con su identidad ya fotografiada aquí.
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
            "usuario_id", "servicio_id", "fecha", "slot_lock_evento_dia",
            unique=True,
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    agenda_id: Mapped[int] = mapped_column(ForeignKey("agendas.id"), index=True)
    servicio_id: Mapped[int] = mapped_column(ForeignKey("servicios.id"), index=True)
    usuario_id: Mapped[int | None] = mapped_column(
        ForeignKey("usuarios.id", ondelete="SET NULL"), index=True, nullable=True
    )
    # Foto de la identidad del colaborador al crear la reserva (ver docstring: sobrevive a
    # la eliminación de la cuenta).
    usuario_nombre: Mapped[str] = mapped_column(String(120))
    usuario_apellido: Mapped[str] = mapped_column(String(120), default="")
    usuario_correo: Mapped[str | None] = mapped_column(String(160), nullable=True)
    fecha: Mapped[date] = mapped_column(Date, index=True)
    hora_inicio: Mapped[time] = mapped_column(Time)
    hora_fin: Mapped[time] = mapped_column(Time)
    estado: Mapped[str] = mapped_column(String(20), default=EstadoReserva.ACTIVA.value, index=True)
    slot_lock: Mapped[str | None] = mapped_column(
        String(1), Computed("IF(estado = 'activa', 'A', NULL)", persisted=True)
    )
    # Foto de usuario.permite_reservas_multiples tomada al crear la reserva (ver docstring).
    permite_multiple_evento_dia: Mapped[bool] = mapped_column(Boolean, default=False)
    slot_lock_evento_dia: Mapped[str | None] = mapped_column(
        String(1),
        Computed(
            "IF(estado = 'activa' AND permite_multiple_evento_dia = 0, 'A', NULL)",
            persisted=True,
        ),
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
