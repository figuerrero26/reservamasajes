from datetime import date, datetime, time

from sqlalchemy import Time, String, Boolean, Date, DateTime, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.utils.time import now, today
from app.utils.vigencia import EstadoVigencia, estado_vigencia, publicado


class Servicio(Base):
    """Actividad reservable, mostrada al público como "Evento" (tarjeta). Sin nombres
    codificados: cada fila es un evento distinto configurado desde el panel admin.

    `duracion_minutos` aquí es solo informativo para la tarjeta pública; la duración real
    de cada cita la sigue gobernando `Agenda.duracion_minutos` (una agenda por área).

    Vigencia (migración 0012): `vigencia_inicio`/`vigencia_fin` (días incluidos) definen
    los días de reserva. La activación y `publicacion_en` controlan la visibilidad. Al terminar,
    el evento deja de recibir reservas sin tocar las existentes; `finalizado_en` solo
    registra cuándo lo detectó la tarea programada (app/services/tareas_programadas.py).

    Límite de participación por persona: `limite_participaciones` reservas no canceladas
    por `periodo_limite` ("evento" = toda la vigencia, "dia", "semana" o "mes"). NULL en
    el límite = sin límite.
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
    vigencia_inicio: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    vigencia_fin: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    publicacion_en: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    hora_apertura: Mapped[time | None] = mapped_column(Time, nullable=True)
    hora_cierre: Mapped[time | None] = mapped_column(Time, nullable=True)
    finalizado_en: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    limite_participaciones: Mapped[int | None] = mapped_column(Integer, nullable=True, default=1)
    periodo_limite: Mapped[str] = mapped_column(String(10), default="dia", server_default="dia")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    @property
    def estado_vigencia(self) -> EstadoVigencia:
        return estado_vigencia(self.vigencia_inicio, self.vigencia_fin, today())

    @property
    def publicado(self) -> bool:
        return self.activo and publicado(self, now())
