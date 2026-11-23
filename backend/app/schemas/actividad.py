from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator, model_validator

from app.schemas.sesion import SesionCreate
from app.schemas.vigencia import ConImagen, EstadoVigencia, PeriodoLimite, VigenciaYReglaCreate, VigenciaYReglaUpdate
from app.utils.vigencia import describir_regla

# Estado de inscripción de una actividad, evaluado en el backend (el portal no repite la
# lógica de fechas):
# - abierta: vigente, con al menos una sesión futura con cupo e inscripciones habilitadas.
# - agotada: vigente pero todas las sesiones futuras están llenas.
# - proximamente: la vigencia del evento todavía no empieza.
# - cerrada: el evento, su área o el switch de inscripciones están desactivados.
# - finalizada: terminó su vigencia o ya no quedan sesiones futuras activas.
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


class ActividadCreate(ConImagen, VigenciaYReglaCreate):
    """El área y la vigencia son obligatorias. Las sesiones iniciales son opcionales y se
    crean en la misma transacción que la actividad (si alguna es inválida, no se crea nada).

    Regla de participación por defecto: sin límite (solo se impide inscribirse dos veces en
    la misma sesión, como hasta ahora)."""
    area_id: int
    nombre: str = Field(min_length=1, max_length=160)
    descripcion_corta: str | None = Field(default=None, max_length=300)
    descripcion_larga: str | None = None
    informacion_adicional: str | None = None
    campos_formulario: list[CampoFormulario] = []
    inscripcion_abierta: bool = True
    limite_participaciones: int | None = Field(default=None, ge=1, le=100)
    periodo_limite: PeriodoLimite = "evento"
    sesiones: list[SesionCreate] = Field(default=[], max_length=50)

    @field_validator("campos_formulario")
    @classmethod
    def _campos(cls, v):
        return _validar_campos(v)


class ActividadUpdate(ConImagen, VigenciaYReglaUpdate):
    area_id: int | None = None  # si se envía, no puede ser null
    nombre: str | None = Field(default=None, min_length=1, max_length=160)
    descripcion_corta: str | None = Field(default=None, max_length=300)
    descripcion_larga: str | None = None
    informacion_adicional: str | None = None
    campos_formulario: list[CampoFormulario] | None = None
    inscripcion_abierta: bool | None = None
    activo: bool | None = None

    @field_validator("campos_formulario")
    @classmethod
    def _campos(cls, v):
        return _validar_campos(v)


class ResumenSesiones(BaseModel):
    """Datos agregados de las sesiones de una actividad (para tarjetas y listados)."""
    sesiones_futuras: int = 0
    proxima_fecha: date | None = None
    proxima_hora_inicio: time | None = None
    proxima_hora_fin: time | None = None
    proximo_lugar: str | None = None
    inscritos_futuros: int = 0
    cupos_disponibles: int | None = None  # None = alguna sesión futura sin límite


def describir_regla_inscripcion(limite: int | None, periodo: str) -> str:
    texto = describir_regla(limite, periodo, "inscripción")
    if limite is None:
        texto = "Sin límite de inscripciones por persona (una por sesión)."
    return texto


class ActividadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    area_id: int | None = None  # None solo en actividades anteriores a la migración 0011
    area_nombre: str | None = None
    nombre: str
    descripcion_corta: str | None = None
    descripcion_larga: str | None = None
    imagen_url: str | None = None
    informacion_adicional: str | None = None
    campos_formulario: list[CampoFormulario] = []
    inscripcion_abierta: bool
    activo: bool
    vigencia_inicio: date | None = None
    vigencia_fin: date | None = None
    finalizado_en: datetime | None = None
    estado_vigencia: EstadoVigencia = "sin_vigencia"
    limite_participaciones: int | None = None
    periodo_limite: PeriodoLimite = "evento"
    estado_inscripcion: EstadoActividad = "finalizada"
    resumen: ResumenSesiones = ResumenSesiones()

    @computed_field
    @property
    def regla_participacion(self) -> str:
        return describir_regla_inscripcion(self.limite_participaciones, self.periodo_limite)


class ActividadPublicaOut(BaseModel):
    """Catálogo público: incluye el estado de inscripción ya evaluado y el resumen de la
    próxima sesión, para que el portal no tenga que repetir esa lógica."""
    id: int
    area_id: int | None = None
    area_nombre: str | None = None
    nombre: str
    descripcion_corta: str | None = None
    descripcion_larga: str | None = None
    imagen_url: str | None = None
    informacion_adicional: str | None = None
    campos_formulario: list[CampoFormulario] = []
    inscripcion_disponible: bool
    estado_inscripcion: EstadoActividad
    vigencia_inicio: date | None = None
    vigencia_fin: date | None = None
    regla_participacion: str
    resumen: ResumenSesiones = ResumenSesiones()
