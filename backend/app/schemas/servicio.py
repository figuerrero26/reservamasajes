from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator, model_validator

from app.schemas.agenda import DURACION_MAX, DURACION_MIN, normalizar_dias, validar_horario
from app.schemas.reserva import ReservaAdminOut
from app.schemas.vigencia import ConImagen, EstadoVigencia, PeriodoLimite, VigenciaYReglaCreate, VigenciaYReglaUpdate
from app.utils.vigencia import describir_regla


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


class ServicioCreate(ConImagen, VigenciaYReglaCreate):
    """Un evento por turnos se crea siempre junto con su área y su primera agenda (en la
    misma transacción), con su vigencia y su regla de participación. Para ofrecerlo en otra
    área se le agrega otra agenda."""
    nombre: str = Field(min_length=1, max_length=120)
    descripcion_corta: str | None = Field(default=None, max_length=255)
    descripcion_larga: str | None = None
    informacion_adicional: str | None = None
    activo: bool = True
    agenda: AgendaInicial


class ServicioUpdate(ConImagen, VigenciaYReglaUpdate):
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
