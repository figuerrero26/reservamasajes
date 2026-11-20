from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class CampoFormulario(BaseModel):
    """Una pregunta del formulario de inscripción configurable por actividad."""
    clave: str = Field(min_length=1, max_length=60)
    etiqueta: str = Field(min_length=1, max_length=200)
    tipo: Literal["texto", "numero", "si_no", "seleccion"]
    requerido: bool = False
    # Solo aplica (y es obligatorio) cuando tipo == "seleccion".
    opciones: list[str] | None = None


class ActividadBase(BaseModel):
    nombre: str = Field(min_length=1, max_length=160)
    descripcion_corta: str | None = None
    descripcion_larga: str | None = None
    imagen_url: str | None = None
    informacion_adicional: str | None = None
    campos_formulario: list[CampoFormulario] = []
    inscripcion_abierta: bool = True
    fecha_apertura_inscripciones: datetime | None = None
    fecha_cierre_inscripciones: datetime | None = None


class ActividadCreate(ActividadBase):
    pass


class ActividadUpdate(BaseModel):
    nombre: str | None = None
    descripcion_corta: str | None = None
    descripcion_larga: str | None = None
    imagen_url: str | None = None
    informacion_adicional: str | None = None
    campos_formulario: list[CampoFormulario] | None = None
    inscripcion_abierta: bool | None = None
    fecha_apertura_inscripciones: datetime | None = None
    fecha_cierre_inscripciones: datetime | None = None
    activo: bool | None = None


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


class ActividadPublicaOut(BaseModel):
    """Catálogo público: igual que ActividadOut pero además informa si hoy se puede
    inscribir (switch + ventana evaluados) para que el portal no tenga que repetir esa
    lógica de fechas."""
    id: int
    nombre: str
    descripcion_corta: str | None = None
    descripcion_larga: str | None = None
    imagen_url: str | None = None
    informacion_adicional: str | None = None
    campos_formulario: list[CampoFormulario] = []
    inscripcion_disponible: bool
