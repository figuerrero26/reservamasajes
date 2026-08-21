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
    usuario_id: int | None = None
    fecha: date
    hora_inicio: time
    hora_fin: time
    estado: str
    notes: str | None = None
    created_at: datetime
    updated_at: datetime
    cancelled_at: datetime | None = None
    cancelled_by: str | None = None


class ReservaAdminOut(ReservaOut):
    """Vista administrativa: agrega identidad del colaborador y nombres legibles de
    evento/área/agenda, para listar quién reservó qué (uso exclusivo del panel)."""
    usuario_nombre: str
    usuario_apellido: str
    usuario_correo: str | None = None
    evento_nombre: str
    area_nombre: str
    agenda_nombre: str


class ReservaCreadaOut(ReservaOut):
    """Respuesta de los endpoints de creación: informa si el correo de confirmación
    pudo enviarse sin bloquear ni revertir la reserva si el envío falla."""
    correo_confirmacion: str = "pendiente"


class SlotDia(BaseModel):
    """Un turno del día para una agenda: si está ocupado, trae quién lo reservó.
    `reserva_estado` distingue si la reserva sigue activa o ya se cerró (completada/
    no_asistio); `puede_marcar_asistencia` indica si el panel debe ofrecer esa acción
    (solo reservas activas cuyo horario ya pasó)."""
    hora_inicio: time
    hora_fin: time
    estado: EstadoSlot
    reserva_id: int | None = None
    reserva_estado: str | None = None
    puede_marcar_asistencia: bool = False
    usuario_nombre: str | None = None
    usuario_apellido: str | None = None
    usuario_correo: str | None = None
    notes: str | None = None


class AgendaDia(BaseModel):
    """Agenda completa (todos sus turnos) de un día, para la vista "por día" del panel:
    muestra los espacios disponibles y ocupados de cualquier área/evento, no solo lo ya
    reservado."""
    agenda_id: int
    agenda_nombre: str
    area_nombre: str
    evento_nombre: str
    slots: list[SlotDia]


class MarcarAsistenciaIn(BaseModel):
    """Cierra el ciclo de una reserva ya pasada: True = asistió (completada), False = no
    asistió."""
    asistio: bool


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
