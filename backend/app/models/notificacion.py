import enum
from datetime import datetime

from sqlalchemy import String, Integer, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class EstadoNotificacion(str, enum.Enum):
    PENDIENTE = "pendiente"
    ENVIADO = "enviado"
    FALLIDO = "fallido"


class Notificacion(Base):
    """Registro de correos enviados (o intentados). Preparado para agregar más tipos
    (cancelación, modificación, recordatorio) sin cambiar el esquema.
    """
    __tablename__ = "notificaciones"

    id: Mapped[int] = mapped_column(primary_key=True)
    reserva_id: Mapped[int | None] = mapped_column(ForeignKey("reservas.id"), nullable=True, index=True)
    # ON DELETE SET NULL: una notificación ya enviada sobrevive a que se elimine la cuenta
    # del colaborador (ver Reserva.usuario_id); `destinatario` ya guarda el correo aparte.
    usuario_id: Mapped[int | None] = mapped_column(
        ForeignKey("usuarios.id", ondelete="SET NULL"), index=True, nullable=True
    )
    tipo: Mapped[str] = mapped_column(String(40), default="confirmacion")
    destinatario: Mapped[str] = mapped_column(String(160))
    estado: Mapped[str] = mapped_column(String(20), default=EstadoNotificacion.PENDIENTE.value, index=True)
    intentos: Mapped[int] = mapped_column(Integer, default=0)
    error_mensaje: Mapped[str | None] = mapped_column(Text, nullable=True)
    enviado_en: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
