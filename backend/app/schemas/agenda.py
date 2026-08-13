from datetime import time

from pydantic import BaseModel, ConfigDict, Field, model_validator


class AgendaBase(BaseModel):
    nombre: str = Field(min_length=1, max_length=140)
    area_id: int
    servicio_id: int
    hora_inicio: time
    hora_fin: time
    almuerzo_inicio: time | None = None
    almuerzo_fin: time | None = None
    duracion_minutos: int = Field(default=30, ge=5, le=480)
    dias_habilitados: str = "0,1,2,3,4"
    activo: bool = True

    @model_validator(mode="after")
    def validar_horas(self):
        if self.hora_fin <= self.hora_inicio:
            raise ValueError("hora_fin debe ser posterior a hora_inicio")
        if (self.almuerzo_inicio is None) != (self.almuerzo_fin is None):
            raise ValueError("almuerzo_inicio y almuerzo_fin deben definirse juntos")
        if self.almuerzo_inicio and self.almuerzo_fin and self.almuerzo_fin <= self.almuerzo_inicio:
            raise ValueError("almuerzo_fin debe ser posterior a almuerzo_inicio")
        return self


class AgendaCreate(AgendaBase):
    pass


class AgendaUpdate(BaseModel):
    nombre: str | None = None
    area_id: int | None = None
    servicio_id: int | None = None
    hora_inicio: time | None = None
    hora_fin: time | None = None
    almuerzo_inicio: time | None = None
    almuerzo_fin: time | None = None
    duracion_minutos: int | None = None
    dias_habilitados: str | None = None
    activo: bool | None = None


class AgendaOut(AgendaBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


class AgendaPublica(BaseModel):
    """Vista pública de la agenda (lo que ve el colaborador)."""
    model_config = ConfigDict(from_attributes=True)
    id: int
    nombre: str
    area_id: int
    servicio_id: int
    area_nombre: str
    servicio_nombre: str
    duracion_minutos: int
