import enum
from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict, EmailStr


class EstadoSlot(str, enum.Enum):
    DISPONIBLE = "disponible"
    OCUPADO = "ocupado"
    BLOQUEADO = "bloqueado"
    PASADO = "pasado"


class Slot(BaseModel):
    hora_inicio: time
    hora_fin: time
    estado: EstadoSlot
    disponible: bool


class HorariosResponse(BaseModel):
    fecha: date
    agenda_id: int
    slots: list[Slot]


class ReservaCreate(BaseModel):
    """Creación pública: el usuario sale del JWT (get_current_usuario), no del body."""
    agenda_id: int
    fecha: date
    hora_inicio: time


class ReservaCreateManual(BaseModel):
    """Creación por un administrador en nombre de un colaborador identificado por correo."""
    correo: EmailStr
    agenda_id: int
    fecha: date
    hora_inicio: time
    notes: str | None = None


class ReservaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    agenda_id: int
    servicio_id: int
    usuario_id: int
    fecha: date
    hora_inicio: time
    hora_fin: time
    estado: str
    notes: str | None = None
    created_at: datetime
    updated_at: datetime
    cancelled_at: datetime | None = None
    cancelled_by: str | None = None


class ReservaCreadaOut(ReservaOut):
    """Respuesta de los endpoints de creación: informa si el correo de confirmación
    pudo enviarse sin bloquear ni revertir la reserva si el envío falla."""
    correo_confirmacion: str = "pendiente"


class ReservaConfirmacion(BaseModel):
    """Detalle mostrado en la ventana de confirmación antes de reservar."""
    evento_nombre: str
    area_nombre: str
    fecha: date
    hora_inicio: time
    hora_fin: time
    duracion_minutos: int
    usuario_nombre: str
    usuario_correo: str
