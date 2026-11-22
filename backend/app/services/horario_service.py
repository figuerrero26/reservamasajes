"""Generación dinámica de horarios.

Los slots NO se almacenan: se calculan a partir de la configuración de la agenda,
aplicando las reglas de casos límite y la zona horaria America/Bogota.

Toda la aritmética de la grilla se hace en minutos desde la medianoche (enteros), nunca
sumando `timedelta` a objetos `time`: un `time` "da la vuelta" al pasar de las 23:59 y eso
hacía que una agenda que termina cerca de la medianoche (p. ej. 20:00–23:45 con turnos de 30
min) generara turnos para siempre. Con enteros el último turno nunca puede superar
`hora_fin`, y además hay un tope duro de iteraciones como segunda barrera.
"""
from dataclasses import dataclass
from datetime import date, time

from sqlalchemy.orm import Session

from app.models import Agenda
from app.repositories.agenda_repository import AgendaRepository
from app.repositories.bloqueo_repository import BloqueoRepository
from app.repositories.configuracion_repository import ConfiguracionRepository
from app.repositories.reserva_repository import ReservaRepository
from app.schemas.reserva import EstadoSlot, Slot
from app.services.errors import NotFound
from app.utils.time import a_minutos, desde_minutos, now, overlaps, today

# Un día tiene 1440 minutos y la duración mínima de un turno es 5: nunca puede haber más de
# 288 turnos legítimos. Cualquier cosa por encima de esto es un error de configuración.
MAX_SLOTS_POR_DIA = 288


@dataclass(frozen=True)
class Franja:
    hora_inicio: time
    hora_fin: time


def grilla_agenda(
    hora_inicio: time, hora_fin: time, duracion_minutos: int,
    almuerzo_inicio: time | None = None, almuerzo_fin: time | None = None,
) -> list[Franja]:
    """Turnos teóricos de una agenda (sin bloqueos ni reservas), en orden.

    Función pura: la usan tanto la generación de disponibilidad como la validación de
    cambios de agenda con reservas existentes (ver AgendaService.actualizar), para que ambas
    partes hablen exactamente de la misma grilla.
    """
    if duracion_minutos is None or duracion_minutos <= 0:
        return []
    inicio, fin = a_minutos(hora_inicio), a_minutos(hora_fin)
    alm_ini = a_minutos(almuerzo_inicio) if almuerzo_inicio and almuerzo_fin else None
    alm_fin = a_minutos(almuerzo_fin) if almuerzo_inicio and almuerzo_fin else None

    franjas: list[Franja] = []
    cursor = inicio
    while cursor + duracion_minutos <= fin and len(franjas) < MAX_SLOTS_POR_DIA:
        siguiente = cursor + duracion_minutos
        # Solape con almuerzo (total o parcial): la franja no existe como slot.
        en_almuerzo = alm_ini is not None and cursor < alm_fin and alm_ini < siguiente
        if not en_almuerzo:
            franjas.append(Franja(desde_minutos(cursor), desde_minutos(siguiente)))
        cursor = siguiente
    return franjas


class HorarioService:
    def __init__(self, db: Session):
        self.db = db
        self.agendas = AgendaRepository(db)
        self.bloqueos = BloqueoRepository(db)
        self.reservas = ReservaRepository(db)
        self.configuracion = ConfiguracionRepository(db)

    def generar(self, agenda_id: int, fecha: date, incluir_pasado: bool = False) -> list[Slot]:
        """Disponibilidad pública de una agenda para una fecha.

        `incluir_pasado=True` es la vista administrativa (ver ReservaService.dia): reconstruye
        también los días pasados y, en vez de devolver una lista vacía para un festivo o un
        bloqueo de día completo, devuelve todos los turnos marcados como BLOQUEADO — así el
        administrador sigue viendo las reservas que quedaron dentro de ese día. El flujo
        público nunca debe ver ni ofrecer días pasados ni bloqueados.
        """
        agenda = self.agendas.get(agenda_id)
        if not agenda or not agenda.activo:
            raise NotFound("Agenda no encontrada o inactiva")
        if not incluir_pasado and not agenda_reservable(agenda):
            # El evento (servicio) o el área se desactivaron: la agenda deja de ofrecer
            # turnos aunque su propio flag siga activo (ver ServicioService.desactivar).
            raise NotFound("Este evento no está disponible en este momento")

        es_pasado = fecha < today()
        # Fecha completamente pasada: nunca hay slots reservables (no solo los del propio
        # día en curso), salvo que se pida explícitamente el histórico.
        if es_pasado and not incluir_pasado:
            return []

        # Fuera de la semana activa configurada por el admin (si hay una definida): sin slots.
        if not incluir_pasado and not self._dentro_de_semana_activa(fecha):
            return []

        # Día no habilitado en la configuración de la agenda: sin slots.
        if fecha.weekday() not in agenda.dias:
            return []

        bloqueos = self.bloqueos.por_agenda_fecha(agenda_id, fecha)
        dia_bloqueado = self.bloqueos.es_festivo(fecha) or any(b.tipo == "dia" for b in bloqueos)
        if dia_bloqueado and not incluir_pasado:
            return []
        rangos_bloqueados = [
            (b.hora_inicio, b.hora_fin)
            for b in bloqueos
            if b.tipo == "rango" and b.hora_inicio and b.hora_fin
        ]

        # Ocupación por SOLAPAMIENTO, no por coincidencia exacta de la hora de inicio: una
        # reserva que quedó fuera de la grilla actual (datos anteriores a la validación de
        # cambios de agenda) sigue bloqueando cualquier turno que se cruce con ella.
        ocupados = [(r.hora_inicio, r.hora_fin) for r in self.reservas.activas_por_agenda_fecha(agenda_id, fecha)]
        ahora = now()
        es_hoy = fecha == today()

        slots: list[Slot] = []
        for franja in grilla_agenda(
            agenda.hora_inicio, agenda.hora_fin, agenda.duracion_minutos,
            agenda.almuerzo_inicio, agenda.almuerzo_fin,
        ):
            ini, fin = franja.hora_inicio, franja.hora_fin
            bloqueado = dia_bloqueado or any(overlaps(ini, fin, b_ini, b_fin) for b_ini, b_fin in rangos_bloqueados)
            ocupado = any(overlaps(ini, fin, o_ini, o_fin) for o_ini, o_fin in ocupados)
            pasado = es_pasado or (es_hoy and ini <= ahora.time())

            if bloqueado:
                estado = EstadoSlot.BLOQUEADO
            elif ocupado:
                estado = EstadoSlot.OCUPADO
            elif pasado:
                estado = EstadoSlot.PASADO
            else:
                estado = EstadoSlot.DISPONIBLE
            slots.append(Slot(
                hora_inicio=ini, hora_fin=fin, estado=estado, disponible=estado == EstadoSlot.DISPONIBLE,
            ))
        return slots

    def _dentro_de_semana_activa(self, fecha: date) -> bool:
        inicio = self.configuracion.get("semana_activa_inicio")
        fin = self.configuracion.get("semana_activa_fin")
        if inicio and fecha < date.fromisoformat(inicio):
            return False
        if fin and fecha > date.fromisoformat(fin):
            return False
        return True


def agenda_reservable(agenda: Agenda) -> bool:
    """Una agenda solo ofrece turnos si ella, su evento (servicio) y su área están activos.
    Es la única fuente de verdad de esta regla: la usan el catálogo público, la
    disponibilidad y la creación de reservas (ver ServicioService / ReservaService)."""
    return bool(agenda.activo and agenda.servicio.activo and agenda.area.activo)
