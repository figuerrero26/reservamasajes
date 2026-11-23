from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator, model_validator

from app.schemas.agenda import DURACION_MAX, DURACION_MIN, normalizar_dias, validar_horario
from app.schemas.reserva import ReservaAdminOut
from app.schemas.tipo_evento import EsquemaDeReserva
from app.schemas.vigencia import ConImagen, EstadoVigencia, PeriodoLimite, VigenciaYReglaCreate, VigenciaYReglaUpdate
from app.utils.vigencia import describir_regla

MAX_AGENDAS_INICIALES = 20


class AgendaInicial(EsquemaDeReserva):
    """Área (lugar) y horario de atención con los que nace un evento de reserva. El área es
    obligatoria: un evento siempre queda registrado en al menos un área (a través de su
    agenda). `nombre` puede identificar el espacio o el profesional que atiende."""
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


class ServicioCreate(EsquemaDeReserva, ConImagen, VigenciaYReglaCreate):
    """Un evento de reserva se crea siempre junto con sus agendas (área + horario de atención
    + duración de los turnos), en la misma transacción, con su vigencia y su regla de
    reserva. `agendas` admite varias áreas de una vez; `agenda` (una sola) se conserva por
    compatibilidad. Solo acepta campos de reserva: los de inscripción (sesiones, cupos,
    formulario…) se rechazan."""
    tipo: Literal["reserva"] | None = None
    nombre: str = Field(min_length=1, max_length=120)
    descripcion_corta: str | None = Field(default=None, max_length=255)
    descripcion_larga: str | None = None
    informacion_adicional: str | None = None
    activo: bool = True
    agenda: AgendaInicial | None = None
    agendas: list[AgendaInicial] = Field(default_factory=list, max_length=MAX_AGENDAS_INICIALES)

    @model_validator(mode="after")
    def _agendas(self):
        if self.agenda is not None:
            if self.agendas:
                raise ValueError("Envía las agendas en «agendas» (o una sola en «agenda»), no en ambos.")
            self.agendas = [self.agenda]
        if not self.agendas:
            raise ValueError("Define al menos una agenda (área y horario de atención) para el evento.")
        areas = [a.area_id for a in self.agendas]
        if len(areas) != len(set(areas)):
            raise ValueError("Cada agenda del evento debe estar en un área distinta.")
        return self


class ServicioUpdate(EsquemaDeReserva, ConImagen, VigenciaYReglaUpdate):
    """Edición de la información, la vigencia y la regla de reserva. Las áreas, horarios y
    turnos se editan en cada agenda del evento (PUT /agendas/{id})."""
    tipo: Literal["reserva"] | None = None
    nombre: str | None = Field(default=None, min_length=1, max_length=120)
    descripcion_corta: str | None = Field(default=None, max_length=255)
    descripcion_larga: str | None = None
    informacion_adicional: str | None = None
    activo: bool | None = None


def describir_regla_reserva(limite: int | None, periodo: str) -> str:
    """En los eventos por turnos siempre rige además una reserva por persona por día."""
    texto = describir_regla(limite, periodo, "reserva")
    if limite is not None and limite > 1:
        texto = texto.rstrip(".") + ", en días distintos."
    return texto


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
    vigencia_inicio: date | None = None
    vigencia_fin: date | None = None
    finalizado_en: datetime | None = None
    estado_vigencia: EstadoVigencia = "sin_vigencia"
    limite_participaciones: int | None = None
    periodo_limite: PeriodoLimite = "dia"

    @computed_field
    @property
    def regla_participacion(self) -> str:
        return describir_regla_reserva(self.limite_participaciones, self.periodo_limite)


class ServicioEstadoOut(ServicioOut):
    """Al desactivar el evento o al acortar su vigencia: reservas futuras que siguen
    vigentes (no se cancelan solas; el administrador decide)."""
    reservas_afectadas: list[ReservaAdminOut] = []
