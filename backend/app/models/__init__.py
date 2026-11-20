"""Importa todos los modelos para que Alembic los descubra."""
from app.database.base import Base
from app.models.rol import Rol
from app.models.administrador import Administrador
from app.models.usuario import Usuario
from app.models.area import Area
from app.models.servicio import Servicio
from app.models.agenda import Agenda
from app.models.reserva import Reserva, EstadoReserva
from app.models.bloqueo import Bloqueo
from app.models.festivo import Festivo
from app.models.auditoria import Auditoria
from app.models.configuracion import ConfiguracionGeneral
from app.models.notificacion import Notificacion, EstadoNotificacion
from app.models.configuracion_smtp import ConfiguracionSmtp
from app.models.actividad import Actividad
from app.models.sesion import Sesion
from app.models.inscripcion import Inscripcion, EstadoInscripcion

__all__ = [
    "Base", "Rol", "Administrador", "Usuario", "Area", "Servicio", "Agenda",
    "Reserva", "EstadoReserva", "Bloqueo", "Festivo", "Auditoria",
    "ConfiguracionGeneral", "Notificacion", "EstadoNotificacion", "ConfiguracionSmtp",
    "Actividad", "Sesion", "Inscripcion", "EstadoInscripcion",
]
