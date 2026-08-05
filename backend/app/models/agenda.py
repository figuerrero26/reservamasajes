from datetime import time

from sqlalchemy import String, Boolean, Integer, Time, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class Agenda(Base):
    """Entidad principal: combinación de Área + Servicio con su configuración."""
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
    duracion_min: Mapped[int] = mapped_column(Integer, default=30)
    # Días habilitados como CSV de enteros (Lun=0 ... Dom=6). Ej: "0,1,2,3,4"
    dias_habilitados: Mapped[str] = mapped_column(String(20), default="0,1,2,3,4")
    estado: Mapped[bool] = mapped_column(Boolean, default=True)  # Activa/Inactiva

    area = relationship("Area")
    servicio = relationship("Servicio")

    @property
    def dias(self) -> list[int]:
        return [int(x) for x in self.dias_habilitados.split(",") if x.strip() != ""]
