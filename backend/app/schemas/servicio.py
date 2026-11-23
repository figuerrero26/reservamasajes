from datetime import time

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.agenda import DURACION_MAX, DURACION_MIN, normalizar_dias, validar_horario
from app.schemas.reserva import ReservaAdminOut


class AgendaInicial(BaseModel):
    """Área y horario con los que nace un evento por turnos. El área es obligatoria: un
    evento siempre queda registrado en al menos un área (a través de su agenda)."""
    area_id: int
    nombre: str | None = Field(default=None, max_length=140)  # por defecto "Evento - Área"
    hora_inicio: time
    hora_fin: time
    almuerzo_inicio: time | None = None
    almuerzo_fin: time | None = None
    duracion_minutos: int = Field(ge=DURACION_MIN, le=DURACION_MAX)
    dias_habilitados: str = "0,1,2,3,4"

    @field_validator("dias_habilitados")
    @classmethod
    def _dias(cls, v: str) -> str:
        return normalizar_dias(v)

    @model_validator(mode="after")
    def _horas(self):
        validar_horario(self.hora_inicio, self.hora_fin, self.almuerzo_inicio, self.almuerzo_fin, self.duracion_minutos)
        return self


class ServicioBase(BaseModel):
    nombre: str = Field(min_length=1, max_length=120)
    descripcion_corta: str | None = Field(default=None, max_length=255)
    descripcion_larga: str | None = None
    imagen_url: str | None = Field(default=None, max_length=500)
    informacion_adicional: str | None = None
    activo: bool = True


class ServicioCreate(ServicioBase):
    """Un evento por turnos se crea siempre junto con su área y su primera agenda (en la
    misma transacción). Para ofrecerlo en otra área se le agrega otra agenda."""
    agenda: AgendaInicial


class ServicioUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=1, max_length=120)
    descripcion_corta: str | None = Field(default=None, max_length=255)
    descripcion_larga: str | None = None
    imagen_url: str | None = Field(default=None, max_length=500)
    informacion_adicional: str | None = None
    activo: bool | None = None


class ServicioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    nombre: str
    descripcion_corta: str | None = None
    descripcion_larga: str | None = None
    imagen_url: str | None = None
    duracion_minutos: int
    informacion_adicional: str | None = None
    activo: bool


class ServicioEstadoOut(ServicioOut):
    """Al desactivar: reservas futuras que siguen vigentes (no se cancelan solas)."""
    reservas_afectadas: list[ReservaAdminOut] = []
