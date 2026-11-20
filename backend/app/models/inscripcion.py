import enum
from datetime import datetime

from sqlalchemy import Computed, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class EstadoInscripcion(str, enum.Enum):
    ACTIVA = "activa"
    CANCELADA = "cancelada"
    COMPLETADA = "completada"
    NO_ASISTIO = "no_asistio"


class Inscripcion(Base):
    """Inscripción de un usuario a una Sesion — equivalente a Reserva para este módulo,
    mismo patrón de diseño: identidad fotografiada (sobrevive a que se borre la cuenta) y
    columna generada `slot_lock` para que el índice único solo bloquee dos inscripciones
    ACTIVAS del mismo usuario a la misma sesión (cancelar libera el cupo y permite
    reinscribirse).

    El control de cupo (cuántas inscripciones activas caben en `sesion.cupo_maximo`) no se
    puede resolver con un índice único — se hace a nivel de aplicación bloqueando la fila de
    la sesión con `SELECT ... FOR UPDATE` antes de contar (ver InscripcionService._crear).
    """
    __tablename__ = "inscripciones"
    __table_args__ = (
        Index(
            "uq_inscripcion_activa_usuario_sesion",
            "usuario_id", "sesion_id", "slot_lock",
            unique=True,
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    sesion_id: Mapped[int] = mapped_column(ForeignKey("sesiones.id"), index=True)
    usuario_id: Mapped[int | None] = mapped_column(
        ForeignKey("usuarios.id", ondelete="SET NULL"), index=True, nullable=True
    )
    usuario_nombre: Mapped[str] = mapped_column(String(120))
    usuario_apellido: Mapped[str] = mapped_column(String(120), default="")
    usuario_correo: Mapped[str | None] = mapped_column(String(160), nullable=True)
    respuestas_formulario: Mapped[str | None] = mapped_column(Text, nullable=True)
    estado: Mapped[str] = mapped_column(String(20), default=EstadoInscripcion.ACTIVA.value, index=True)
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

    sesion = relationship("Sesion")
    usuario = relationship("Usuario")
