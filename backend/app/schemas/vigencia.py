"""Campos comunes de vigencia y regla de participación (eventos por turnos y actividades).

La lógica vive en app/utils/vigencia.py; aquí solo se validan los datos que llegan del
panel. La comparación con "hoy" (no crear un evento que ya terminó) se hace en los
servicios, con la fecha de la zona horaria de la aplicación.
"""
from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.utils.uploads import normalizar_url_imagen

PeriodoLimite = Literal["evento", "dia", "semana", "mes"]
EstadoVigencia = Literal["sin_vigencia", "proximo", "vigente", "finalizado"]
MAX_LIMITE_PARTICIPACIONES = 100
MAX_DIAS_VIGENCIA = 731  # dos años


def validar_rango_vigencia(inicio: date | None, fin: date | None) -> None:
    if inicio and fin:
        if fin < inicio:
            raise ValueError("La fecha de finalización debe ser igual o posterior a la de inicio.")
        if (fin - inicio).days + 1 > MAX_DIAS_VIGENCIA:
            raise ValueError(f"La vigencia no puede superar {MAX_DIAS_VIGENCIA} días.")


class HorarioParticipacion(BaseModel):
    publicacion_en: datetime | None = None
    hora_apertura: time | None = None
    hora_cierre: time | None = None

    @field_validator("publicacion_en", "hora_apertura", "hora_cierre")
    @classmethod
    def _hora_local(cls, valor):
        if valor is not None and valor.tzinfo is not None:
            raise ValueError("Indica la fecha y hora local de la aplicación, sin zona horaria.")
        return valor


def validar_horario_participacion(
    inicio: date | None, fin: date | None, horario: HorarioParticipacion,
) -> None:
    if horario.hora_apertura is not None and inicio is None:
        raise ValueError("Define la fecha de apertura para configurar su hora.")
    if horario.hora_cierre is not None and fin is None:
        raise ValueError("Define la fecha de cierre para configurar su hora.")
    if inicio and inicio == fin and horario.hora_cierre is not None:
        if horario.hora_cierre <= (horario.hora_apertura or time.min):
            raise ValueError("El cierre debe ser posterior a la apertura.")


class VigenciaYReglaCreate(HorarioParticipacion):
    """Al crear un evento la vigencia es obligatoria (inicio y fin)."""
    vigencia_inicio: date
    vigencia_fin: date
    limite_participaciones: int | None = Field(default=1, ge=1, le=MAX_LIMITE_PARTICIPACIONES)
    periodo_limite: PeriodoLimite = "dia"

    @model_validator(mode="after")
    def _vigencia(self):
        validar_rango_vigencia(self.vigencia_inicio, self.vigencia_fin)
        validar_horario_participacion(self.vigencia_inicio, self.vigencia_fin, self)
        return self


class VigenciaYReglaUpdate(HorarioParticipacion):
    """Edición parcial. Las fechas, si se envían, no pueden quedar vacías (validado en el
    servicio junto con los valores actuales); `limite_participaciones` en null = sin límite."""
    vigencia_inicio: date | None = None
    vigencia_fin: date | None = None
    limite_participaciones: int | None = Field(default=None, ge=1, le=MAX_LIMITE_PARTICIPACIONES)
    periodo_limite: PeriodoLimite | None = None

    @model_validator(mode="after")
    def _vigencia(self):
        validar_rango_vigencia(self.vigencia_inicio, self.vigencia_fin)
        return self


class ConImagen(BaseModel):
    """`imagen_url`: URL web (http/https) o archivo subido al servidor; vacío = sin imagen."""
    imagen_url: str | None = Field(default=None, max_length=500)

    @field_validator("imagen_url")
    @classmethod
    def _imagen(cls, v: str | None) -> str | None:
        return normalizar_url_imagen(v)
