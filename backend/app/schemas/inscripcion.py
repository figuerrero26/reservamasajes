from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

Respuestas = dict[str, str | float | bool | None]


class InscripcionCreate(BaseModel):
    """Creación pública: el usuario sale del JWT (get_current_usuario), no del body."""
    sesion_id: int
    respuestas: Respuestas = {}


class InscripcionCreateManual(BaseModel):
    """Creación por un administrador en nombre de un colaborador identificado por correo."""
    correo: EmailStr
    sesion_id: int
    respuestas: Respuestas = {}
    notes: str | None = Field(default=None, max_length=1000)


class InscripcionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    sesion_id: int
    usuario_id: int | None = None
    respuestas_formulario: dict | None = None
    estado: str
    notes: str | None = None
    created_at: datetime
    cancelled_at: datetime | None = None
    cancelled_by: str | None = None


class MiInscripcionOut(InscripcionOut):
    """Vista propia del colaborador: agrega nombres legibles de la actividad/sesión."""
    actividad_id: int
    actividad_nombre: str
    sesion_fecha: str
    sesion_hora_inicio: str
    sesion_hora_fin: str
    sesion_lugar: str | None = None
    puede_cancelar: bool = False


class InscripcionAdminOut(InscripcionOut):
    """Vista administrativa: agrega identidad del colaborador y nombres legibles de la
    actividad/sesión. `puede_marcar_asistencia`: solo inscripciones activas cuya sesión ya
    empezó."""
    usuario_nombre: str
    usuario_apellido: str
    usuario_correo: str | None = None
    actividad_id: int
    actividad_nombre: str
    sesion_fecha: str
    sesion_hora_inicio: str
    puede_marcar_asistencia: bool = False


class MarcarAsistenciaInscripcionIn(BaseModel):
    asistio: bool


class CancelarInscripcionIn(BaseModel):
    motivo: str | None = Field(default=None, max_length=500)
    notificar: bool = True
