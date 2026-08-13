from datetime import datetime

from sqlalchemy import String, Boolean, DateTime, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class Servicio(Base):
    """Actividad reservable, mostrada al público como "Evento" (tarjeta). Sin nombres
    codificados: cada fila es un evento distinto configurado desde el panel admin.

    `duracion_minutos` aquí es solo informativo para la tarjeta pública; la duración real
    de cada cita la sigue gobernando `Agenda.duracion_minutos` (una agenda por área).
    """
    __tablename__ = "servicios"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    descripcion_corta: Mapped[str | None] = mapped_column(String(255), nullable=True)
    descripcion_larga: Mapped[str | None] = mapped_column(Text, nullable=True)
    imagen_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    duracion_minutos: Mapped[int] = mapped_column(Integer, default=30)
    informacion_adicional: Mapped[str | None] = mapped_column(Text, nullable=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
