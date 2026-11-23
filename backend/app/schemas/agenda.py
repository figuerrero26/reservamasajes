import re
from datetime import time

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.reserva import ReservaAdminOut
from app.schemas.tipo_evento import EsquemaDeReserva
from app.utils.time import a_minutos

DURACION_MIN, DURACION_MAX = 5, 480
_PATRON_DIAS = re.compile(r"^[0-6](,[0-6])*$")


def normalizar_dias(valor: str) -> str:
    """'4, 0,2,2' -> '0,2,4'. Lanza ValueError si el formato no es una lista de 0..6."""
    limpio = (valor or "").replace(" ", "")
    if not _PATRON_DIAS.fullmatch(limpio):
        raise ValueError("dias_habilitados debe ser una lista de días 0-6 separados por coma (0 = lunes)")
    return ",".join(str(d) for d in sorted({int(x) for x in limpio.split(",")}))


def validar_horario(hora_inicio: time, hora_fin: time, almuerzo_inicio: time | None,
                    almuerzo_fin: time | None, duracion_minutos: int) -> None:
    """Reglas de una agenda coherente. Se comparten entre la creación (validador del
    esquema) y la edición (AgendaService.actualizar, sobre los valores ya combinados)."""
    if hora_fin <= hora_inicio:
        raise ValueError("La hora de fin debe ser posterior a la hora de inicio")
    if not DURACION_MIN <= duracion_minutos <= DURACION_MAX:
        raise ValueError(f"La duración del turno debe estar entre {DURACION_MIN} y {DURACION_MAX} minutos")
    if a_minutos(hora_fin) - a_minutos(hora_inicio) < duracion_minutos:
        raise ValueError("El horario de atención es más corto que un turno: no se generaría ningún turno")
    if (almuerzo_inicio is None) != (almuerzo_fin is None):
        raise ValueError("El inicio y el fin del almuerzo deben definirse juntos")
    if almuerzo_inicio and almuerzo_fin:
        if almuerzo_fin <= almuerzo_inicio:
            raise ValueError("El fin del almuerzo debe ser posterior a su inicio")
        if almuerzo_inicio < hora_inicio or almuerzo_fin > hora_fin:
            raise ValueError("El almuerzo debe quedar dentro del horario de atención")


class AgendaBase(EsquemaDeReserva):
    nombre: str = Field(min_length=1, max_length=140)
    area_id: int
    servicio_id: int
    hora_inicio: time
    hora_fin: time
    almuerzo_inicio: time | None = None
    almuerzo_fin: time | None = None
    duracion_minutos: int = Field(default=30, ge=DURACION_MIN, le=DURACION_MAX)
    dias_habilitados: str = "0,1,2,3,4"
    activo: bool = True


class AgendaCreate(AgendaBase):
    @field_validator("dias_habilitados")
    @classmethod
    def _dias(cls, v: str) -> str:
        return normalizar_dias(v)

    @model_validator(mode="after")
    def _horas(self):
        validar_horario(self.hora_inicio, self.hora_fin, self.almuerzo_inicio, self.almuerzo_fin,
                        self.duracion_minutos)
        return self


class AgendaUpdate(EsquemaDeReserva):
    """Edición parcial. Las reglas de coherencia se validan en el servicio sobre los valores
    YA combinados con los actuales (un cambio parcial puede ser válido o no según lo que ya
    tenía la agenda), junto con el impacto sobre las reservas existentes."""
    nombre: str | None = Field(default=None, min_length=1, max_length=140)
    area_id: int | None = None
    servicio_id: int | None = None
    hora_inicio: time | None = None
    hora_fin: time | None = None
    almuerzo_inicio: time | None = None
    almuerzo_fin: time | None = None
    duracion_minutos: int | None = Field(default=None, ge=DURACION_MIN, le=DURACION_MAX)
    dias_habilitados: str | None = None
    activo: bool | None = None

    @field_validator("dias_habilitados")
    @classmethod
    def _dias(cls, v: str | None) -> str | None:
        return normalizar_dias(v) if v is not None else None


class AgendaOut(BaseModel):
    """Sin restricciones: debe poder serializar cualquier fila existente aunque sea anterior
    a las reglas actuales."""
    model_config = ConfigDict(from_attributes=True)
    id: int
    nombre: str
    area_id: int
    servicio_id: int
    hora_inicio: time
    hora_fin: time
    almuerzo_inicio: time | None = None
    almuerzo_fin: time | None = None
    duracion_minutos: int
    dias_habilitados: str
    activo: bool


class AgendaEstadoOut(AgendaOut):
    """Respuesta al activar/desactivar: las reservas futuras que siguen vigentes en la
    agenda desactivada, para que el administrador decida qué hacer con ellas."""
    reservas_afectadas: list[ReservaAdminOut] = []


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
    # Información del lugar y horario de atención, para que el colaborador elija dónde reservar.
    area_descripcion: str | None = None
    hora_inicio: time | None = None
    hora_fin: time | None = None
    dias_habilitados: str | None = None
