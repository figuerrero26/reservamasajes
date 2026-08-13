from datetime import time, datetime

from sqlalchemy import String, Boolean, Integer, Time, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class Agenda(Base):
    """Entidad principal: combinación de Área + Servicio con su configuración.

    Es la unidad real sobre la que se realizan las reservas. Se crea desde el panel
    administrativo seleccionando un área y un servicio existentes; nada de esto está
    codificado en el programa.
    """
    __tablename__ = "agendas"
    __table_args__ = (UniqueConstraint("area_id", "servicio_id", name="uq_agenda_area_servicio"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(140))
    area_id: Mapped[int] = mapped_column(ForeignKey("areas.id"), index=True)
    servicio_id: Mapped[int] = mapped_column(ForeignKey("servicios.id"), index=True)

    hora_inicio: Mapped[time] = mapped_column(Time)
    hora_fin: Mapped[time] = mapped_column(Time)
    almuerzo_inicio: Mapped[time | None] = mapped_column(Time, nullable=True)
    almuerzo_fin: Mapped[time | None] = mapped_column(Time, nullable=True)
    duracion_minutos: Mapped[int] = mapped_column(Integer, default=30)
    # Días habilitados como CSV de enteros (Lun=0 ... Dom=6). Ej: "0,1,2,3,4"
    dias_habilitados: Mapped[str] = mapped_column(String(20), default="0,1,2,3,4")
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    area = relationship("Area")
    servicio = relationship("Servicio")

    @property
    def dias(self) -> list[int]:
        return [int(x) for x in self.dias_habilitados.split(",") if x.strip() != ""]

    @property
    def area_nombre(self) -> str:
        return self.area.nombre

    @property
    def servicio_nombre(self) -> str:
        return self.servicio.nombre
