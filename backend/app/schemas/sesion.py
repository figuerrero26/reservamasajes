from datetime import date, time
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

MAX_DIAS_LOTE = 366
MAX_SESIONES_LOTE = 200

# Estado de una sesión tal como lo ve el portal:
# - disponible: se puede inscribir.
# - cupo_lleno: se alcanzó el cupo máximo (las inscripciones se cierran solas).
# - cerrada: la actividad no acepta inscripciones (switch manual o ventana de fechas).
# - finalizada: la sesión ya empezó o terminó.
# - inactiva: el administrador la desactivó.
EstadoSesion = Literal["disponible", "cupo_lleno", "cerrada", "finalizada", "inactiva"]


class SesionBase(BaseModel):
    fecha: date
    hora_inicio: time
    hora_fin: time
    cupo_maximo: int | None = Field(default=None, ge=1, le=100000)
    lugar: str | None = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def _horas(self):
        if self.hora_fin <= self.hora_inicio:
            raise ValueError("La hora de fin debe ser posterior a la hora de inicio")
        return self


class SesionCreate(SesionBase):
    pass


class SesionUpdate(BaseModel):
    """Edición parcial: las reglas (horas coherentes, cupo no menor que los inscritos) se
    validan en el servicio con los valores ya combinados."""
    fecha: date | None = None
    hora_inicio: time | None = None
    hora_fin: time | None = None
    cupo_maximo: int | None = Field(default=None, ge=1, le=100000)
    lugar: str | None = Field(default=None, max_length=200)
    activa: bool | None = None


class SesionOut(BaseModel):
    id: int
    actividad_id: int
    fecha: date
    hora_inicio: time
    hora_fin: time
    cupo_maximo: int | None = None
    lugar: str | None = None
    activa: bool
    inscritos: int
    cupos_disponibles: int | None = None  # None = sin límite
    estado: EstadoSesion = "disponible"
    # Solo en el endpoint público con sesión iniciada: si el colaborador ya está inscrito.
    inscrito: bool | None = None


class GenerarSesionesIn(BaseModel):
    """Atajo para crear varias sesiones iguales en un rango de días — útil cuando una
    actividad sí se repite (ej. un taller todos los martes de un mes)."""
    fecha_inicio: date
    fecha_fin: date
    dias_semana: list[int] = Field(min_length=1, max_length=7)  # 0=lunes ... 6=domingo
    hora_inicio: time
    hora_fin: time
    cupo_maximo: int | None = Field(default=None, ge=1, le=100000)
    lugar: str | None = Field(default=None, max_length=200)

    @field_validator("dias_semana")
    @classmethod
    def _dias(cls, v: list[int]) -> list[int]:
        if any(d < 0 or d > 6 for d in v):
            raise ValueError("Los días de la semana van de 0 (lunes) a 6 (domingo)")
        return sorted(set(v))

    @model_validator(mode="after")
    def _rango(self):
        if self.fecha_fin < self.fecha_inicio:
            raise ValueError("La fecha final debe ser igual o posterior a la inicial")
        if (self.fecha_fin - self.fecha_inicio).days + 1 > MAX_DIAS_LOTE:
            raise ValueError(f"El rango no puede superar {MAX_DIAS_LOTE} días")
        if self.hora_fin <= self.hora_inicio:
            raise ValueError("La hora de fin debe ser posterior a la hora de inicio")
        return self
