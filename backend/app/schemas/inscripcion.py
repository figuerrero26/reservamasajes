from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr


class InscripcionCreate(BaseModel):
    """Creación pública: el usuario sale del JWT (get_current_usuario), no del body."""
    sesion_id: int
    respuestas: dict[str, str | float | bool | None] = {}


class InscripcionCreateManual(BaseModel):
    """Creación por un administrador en nombre de un colaborador identificado por correo."""
    correo: EmailStr
    sesion_id: int
    respuestas: dict[str, str | float | bool | None] = {}
    notes: str | None = None


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
    """Vista propia del colaborador: agrega nombres legibles de la actividad/sesión para no
    necesitar un segundo fetch en el portal (ver InscripcionService.mias)."""
    actividad_nombre: str
    sesion_fecha: str
    sesion_hora_inicio: str
    sesion_hora_fin: str


class InscripcionAdminOut(InscripcionOut):
    """Vista administrativa: agrega identidad del colaborador y nombres legibles de la
    actividad/sesión (uso exclusivo del panel, ver InscripcionService.buscar).
    `puede_marcar_asistencia` indica si el panel debe ofrecer esa acción (solo inscripciones
    activas cuya sesión ya ocurrió)."""
    usuario_nombre: str
    usuario_apellido: str
    usuario_correo: str | None = None
    actividad_nombre: str
    sesion_fecha: str
    sesion_hora_inicio: str
    puede_marcar_asistencia: bool = False


class MarcarAsistenciaInscripcionIn(BaseModel):
    asistio: bool
