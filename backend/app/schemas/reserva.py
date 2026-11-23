import enum
from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict, EmailStr, Field


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
    notes: str | None = Field(default=None, max_length=1000)


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


class MiReservaOut(ReservaOut):
    """Vista propia del colaborador: agrega los nombres del evento y del área, para que el
    portal no dependa de que el evento siga publicado en el catálogo para mostrarlos."""
    evento_nombre: str
    area_nombre: str
    puede_cancelar: bool = False


class ReservaAdminOut(ReservaOut):
    """Vista administrativa: agrega identidad del colaborador y nombres legibles de
    evento/área/agenda, para listar quién reservó qué (uso exclusivo del panel)."""
    usuario_nombre: str
    usuario_apellido: str
    usuario_correo: str | None = None
    evento_nombre: str
    area_nombre: str
    agenda_nombre: str


class VerificacionReservaOut(BaseModel):
    """Si el colaborador autenticado puede reservar en un evento un día dado (reglas del
    evento: vigencia y límite de participación). `motivo` explica por qué no."""
    permitido: bool
    motivo: str | None = None


class ReservaCreadaOut(ReservaOut):
    """Respuesta de los endpoints de creación. El correo de confirmación se envía en segundo
    plano (no bloquea ni revierte la reserva), por eso aquí siempre es "pendiente"; el
    resultado real queda en la tabla `notificaciones`."""
    correo_confirmacion: str = "pendiente"


class CancelacionIn(BaseModel):
    """Cancelación administrativa: motivo opcional (se incluye en el correo al colaborador)
    y si se le debe notificar."""
    motivo: str | None = Field(default=None, max_length=500)
    notificar: bool = True


class CancelarLoteIn(CancelacionIn):
    """Cancelación de varias reservas a la vez, típicamente las afectadas por un bloqueo,
    festivo o la desactivación de un evento. Siempre la confirma el administrador."""
    reserva_ids: list[int] = Field(min_length=1, max_length=500)


class CancelarLoteOut(BaseModel):
    canceladas: list[int]
    omitidas: list[int]  # ya no estaban activas o no existen


class SlotDia(BaseModel):
    """Un turno del día para una agenda: si está ocupado, trae quién lo reservó.
    `fuera_de_grilla` marca una reserva que no coincide con ningún turno de la configuración
    actual de la agenda (datos históricos)."""
    hora_inicio: time
    hora_fin: time
    estado: EstadoSlot
    reserva_id: int | None = None
    reserva_estado: str | None = None
    usuario_nombre: str | None = None
    usuario_apellido: str | None = None
    usuario_correo: str | None = None
    notes: str | None = None
    fuera_de_grilla: bool = False


class AgendaDia(BaseModel):
    """Agenda completa (todos sus turnos) de un día, para la vista "por día" del panel."""
    agenda_id: int
    agenda_nombre: str
    area_nombre: str
    evento_nombre: str
    agenda_activa: bool = True
    slots: list[SlotDia]


