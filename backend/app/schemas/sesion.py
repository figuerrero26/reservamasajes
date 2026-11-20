from datetime import date, time

from pydantic import BaseModel, Field


class SesionBase(BaseModel):
    fecha: date
    hora_inicio: time
    hora_fin: time
    cupo_maximo: int | None = Field(default=None, ge=1)


class SesionCreate(SesionBase):
    pass


class SesionUpdate(BaseModel):
    fecha: date | None = None
    hora_inicio: time | None = None
    hora_fin: time | None = None
    cupo_maximo: int | None = Field(default=None, ge=1)
    activa: bool | None = None


class SesionOut(BaseModel):
    id: int
    actividad_id: int
    fecha: date
    hora_inicio: time
    hora_fin: time
    cupo_maximo: int | None = None
    activa: bool
    inscritos: int
    cupos_disponibles: int | None = None  # None = sin límite


class GenerarSesionesIn(BaseModel):
    """Atajo para crear varias sesiones iguales en un rango de días — útil cuando una
    actividad sí se repite (ej. un taller todos los martes de un mes)."""
    fecha_inicio: date
    fecha_fin: date
    dias_semana: list[int] = Field(min_length=1)  # 0=lunes ... 6=domingo
    hora_inicio: time
    hora_fin: time
    cupo_maximo: int | None = Field(default=None, ge=1)
