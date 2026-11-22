from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# Estado de inscripción de una actividad, evaluado en el backend (el portal no repite la
# lógica de fechas):
# - abierta: hay al menos una sesión futura con cupo y la ventana de inscripción está abierta.
# - agotada: la ventana está abierta pero todas las sesiones futuras están llenas.
# - proximamente: la ventana de inscripción todavía no abre.
# - cerrada: switch manual apagado o ya pasó la fecha de cierre.
# - finalizada: no quedan sesiones futuras activas.
EstadoActividad = Literal["abierta", "agotada", "proximamente", "cerrada", "finalizada"]


class CampoFormulario(BaseModel):
    """Una pregunta del formulario de inscripción configurable por actividad."""
    clave: str = Field(min_length=1, max_length=60)
    etiqueta: str = Field(min_length=1, max_length=200)
    tipo: Literal["texto", "numero", "si_no", "seleccion"]
    requerido: bool = False
    # Solo aplica (y es obligatorio) cuando tipo == "seleccion".
    opciones: list[str] | None = None

    @model_validator(mode="after")
    def _opciones(self):
        if self.tipo == "seleccion":
            opciones = [o.strip() for o in (self.opciones or []) if o and o.strip()]
            if not opciones:
                raise ValueError(f"La pregunta «{self.etiqueta}» es de selección y necesita al menos una opción")
            self.opciones = list(dict.fromkeys(opciones))
        else:
            self.opciones = None
        return self


def _validar_campos(campos: list[CampoFormulario] | None) -> list[CampoFormulario] | None:
    if campos is None:
        return None
    claves = [c.clave for c in campos]
    if len(claves) != len(set(claves)):
        raise ValueError("Cada pregunta del formulario debe tener una clave distinta")
    if len(campos) > 30:
        raise ValueError("El formulario admite como máximo 30 preguntas")
    return campos


class ActividadBase(BaseModel):
    nombre: str = Field(min_length=1, max_length=160)
    descripcion_corta: str | None = Field(default=None, max_length=300)
    descripcion_larga: str | None = None
    imagen_url: str | None = Field(default=None, max_length=500)
    informacion_adicional: str | None = None
    campos_formulario: list[CampoFormulario] = []
    inscripcion_abierta: bool = True
    fecha_apertura_inscripciones: datetime | None = None
    fecha_cierre_inscripciones: datetime | None = None

    @field_validator("campos_formulario")
    @classmethod
    def _campos(cls, v):
        return _validar_campos(v)

    @field_validator("fecha_apertura_inscripciones", "fecha_cierre_inscripciones")
    @classmethod
    def _sin_zona(cls, v: datetime | None) -> datetime | None:
        # Las columnas son DATETIME sin zona y se comparan contra la hora local de la
        # aplicación: si el cliente manda un valor con zona, se descarta la zona.
        return v.replace(tzinfo=None) if v and v.tzinfo else v

    @model_validator(mode="after")
    def _ventana(self):
        if (self.fecha_apertura_inscripciones and self.fecha_cierre_inscripciones
                and self.fecha_cierre_inscripciones <= self.fecha_apertura_inscripciones):
            raise ValueError("El cierre de inscripciones debe ser posterior a la apertura")
        return self


class ActividadCreate(ActividadBase):
    pass


class ActividadUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=1, max_length=160)
    descripcion_corta: str | None = Field(default=None, max_length=300)
    descripcion_larga: str | None = None
    imagen_url: str | None = Field(default=None, max_length=500)
    informacion_adicional: str | None = None
    campos_formulario: list[CampoFormulario] | None = None
    inscripcion_abierta: bool | None = None
    fecha_apertura_inscripciones: datetime | None = None
    fecha_cierre_inscripciones: datetime | None = None
    activo: bool | None = None

    @field_validator("campos_formulario")
    @classmethod
    def _campos(cls, v):
        return _validar_campos(v)

    @field_validator("fecha_apertura_inscripciones", "fecha_cierre_inscripciones")
    @classmethod
    def _sin_zona(cls, v: datetime | None) -> datetime | None:
        return v.replace(tzinfo=None) if v and v.tzinfo else v


class ResumenSesiones(BaseModel):
    """Datos agregados de las sesiones de una actividad (para tarjetas y listados)."""
    sesiones_futuras: int = 0
    proxima_fecha: date | None = None
    proxima_hora_inicio: time | None = None
    proxima_hora_fin: time | None = None
    proximo_lugar: str | None = None
    inscritos_futuros: int = 0
    cupos_disponibles: int | None = None  # None = alguna sesión futura sin límite


class ActividadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    nombre: str
    descripcion_corta: str | None = None
    descripcion_larga: str | None = None
    imagen_url: str | None = None
    informacion_adicional: str | None = None
    campos_formulario: list[CampoFormulario] = []
    inscripcion_abierta: bool
    fecha_apertura_inscripciones: datetime | None = None
    fecha_cierre_inscripciones: datetime | None = None
    activo: bool
    estado_inscripcion: EstadoActividad = "finalizada"
    resumen: ResumenSesiones = ResumenSesiones()


class ActividadPublicaOut(BaseModel):
    """Catálogo público: incluye el estado de inscripción ya evaluado y el resumen de la
    próxima sesión, para que el portal no tenga que repetir esa lógica."""
    id: int
    nombre: str
    descripcion_corta: str | None = None
    descripcion_larga: str | None = None
    imagen_url: str | None = None
    informacion_adicional: str | None = None
    campos_formulario: list[CampoFormulario] = []
    inscripcion_disponible: bool
    estado_inscripcion: EstadoActividad
    fecha_apertura_inscripciones: datetime | None = None
    fecha_cierre_inscripciones: datetime | None = None
    resumen: ResumenSesiones = ResumenSesiones()
