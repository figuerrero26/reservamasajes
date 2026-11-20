from datetime import date, datetime, time

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Time, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class Sesion(Base):
    """Una ocurrencia concreta de una Actividad: fecha + horario + cupo propio.

    No hay recurrencia por día de la semana (a diferencia de Agenda): cada sesión es una
    fila explícita. Una actividad con varias fechas/horarios simplemente tiene varias filas
    de Sesion — eso resuelve "número de sesiones" sin necesitar un motor de recurrencia.
    `cupo_maximo` en NULL significa sin límite de participantes.
    """
    __tablename__ = "sesiones"

    id: Mapped[int] = mapped_column(primary_key=True)
    actividad_id: Mapped[int] = mapped_column(ForeignKey("actividades.id"), index=True)
    fecha: Mapped[date] = mapped_column(Date, index=True)
    hora_inicio: Mapped[time] = mapped_column(Time)
    hora_fin: Mapped[time] = mapped_column(Time)
    cupo_maximo: Mapped[int | None] = mapped_column(Integer, nullable=True)
    activa: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    actividad = relationship("Actividad", back_populates="sesiones")
