from datetime import date, datetime

from sqlalchemy import String, Boolean, Date, DateTime, ForeignKey, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.utils.time import today
from app.utils.vigencia import EstadoVigencia, estado_vigencia


class Actividad(Base):
    """Actividad genérica con inscripción y cupo (ej. caminata, taller, competencia) —
    módulo paralelo a Servicio/Agenda/Reserva para casos que no son "un día de la semana
    que se repite, una persona por turno exacto" (ver docstring de la migración 0009).

    `campos_formulario` es un JSON serializado (lista de `CampoFormulario`, ver
    app/schemas/actividad.py) que define qué preguntas se le hacen al inscribirse; puede
    ser una lista vacía si la actividad no necesita datos adicionales del nombre/correo.

    Vigencia y límite de participación: mismas columnas y misma regla que en Servicio (ver
    app/models/servicio.py y app/utils/vigencia.py). Aquí el periodo del límite se mide con
    la fecha de cada sesión.
    """
    __tablename__ = "actividades"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Área a la que pertenece la actividad: obligatoria al crear o editar (validado en la
    # API). La columna admite NULL solo por las actividades creadas antes de la migración
    # 0011; el panel las marca como "sin área" para que se les asigne una.
    area_id: Mapped[int | None] = mapped_column(ForeignKey("areas.id"), nullable=True, index=True)
    nombre: Mapped[str] = mapped_column(String(160))
    descripcion_corta: Mapped[str | None] = mapped_column(String(300), nullable=True)
    descripcion_larga: Mapped[str | None] = mapped_column(Text, nullable=True)
    imagen_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    informacion_adicional: Mapped[str | None] = mapped_column(Text, nullable=True)
    campos_formulario: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Switch manual: si está en False, nadie puede inscribirse desde el portal aunque el
    # evento esté vigente (pausa temporal; el administrador sí puede inscribir).
    inscripcion_abierta: Mapped[bool] = mapped_column(Boolean, default=True)
    # OBSOLETAS desde la migración 0012: la vigencia del evento reemplazó a esta ventana de
    # inscripción (sus valores se trasladaron a vigencia_inicio/vigencia_fin). Se conservan
    # sin uso para no perder el dato original ni romper el downgrade.
    fecha_apertura_inscripciones: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    fecha_cierre_inscripciones: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    vigencia_inicio: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    vigencia_fin: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    finalizado_en: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Por defecto sin límite: la única restricción histórica de las actividades era no
    # inscribirse dos veces en la misma sesión (índice único de `inscripciones`).
    limite_participaciones: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    periodo_limite: Mapped[str] = mapped_column(String(10), default="evento", server_default="evento")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    sesiones = relationship("Sesion", back_populates="actividad", order_by="Sesion.fecha")
    area = relationship("Area")

    @property
    def estado_vigencia(self) -> EstadoVigencia:
        return estado_vigencia(self.vigencia_inicio, self.vigencia_fin, today())
