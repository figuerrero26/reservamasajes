"""Campos comunes de vigencia y regla de participación (eventos por turnos y actividades).

La lógica vive en app/utils/vigencia.py; aquí solo se validan los datos que llegan del
panel. La comparación con "hoy" (no crear un evento que ya terminó) se hace en los
servicios, con la fecha de la zona horaria de la aplicación.
"""
from datetime import date
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


class VigenciaYReglaCreate(BaseModel):
    """Al crear un evento la vigencia es obligatoria (inicio y fin)."""
    vigencia_inicio: date
    vigencia_fin: date
    limite_participaciones: int | None = Field(default=1, ge=1, le=MAX_LIMITE_PARTICIPACIONES)
    periodo_limite: PeriodoLimite = "dia"

    @model_validator(mode="after")
    def _vigencia(self):
        validar_rango_vigencia(self.vigencia_inicio, self.vigencia_fin)
        return self


class VigenciaYReglaUpdate(BaseModel):
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
