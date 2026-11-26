"""Generación dinámica de horarios.

Los slots NO se almacenan: se calculan a partir de la configuración de la agenda,
aplicando las reglas de casos límite y la zona horaria America/Bogota.

Toda la aritmética de la grilla se hace en minutos desde la medianoche (enteros), nunca
sumando `timedelta` a objetos `time`: un `time` "da la vuelta" al pasar de las 23:59 y eso
hacía que una agenda que termina cerca de la medianoche (p. ej. 20:00–23:45 con turnos de 30
min) generara turnos para siempre. Con enteros el último turno nunca puede superar
`hora_fin`, y además hay un tope duro de iteraciones como segunda barrera.

Estructura: `calcular_slots` es una función pura (recibe los bloqueos, festivo y reservas ya
cargados). La usan tanto la disponibilidad de un día (`HorarioService.generar`, una agenda)
como el resumen del detalle de un evento (`HorarioService.resumen_disponibilidad`, varias
agendas y días con consultas agrupadas): las dos vistas aplican exactamente la misma regla.

Vigencia: cada evento tiene su propio periodo (ver app/utils/vigencia.py). Fuera de él la
agenda no ofrece turnos ni acepta reservas; las reservas que ya existían no se tocan.
"""
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from sqlalchemy.orm import Session

from app.models import Agenda, Servicio
from app.repositories.agenda_repository import AgendaRepository
from app.repositories.bloqueo_repository import BloqueoRepository
from app.repositories.reserva_repository import ReservaRepository
from app.schemas.reserva import EstadoSlot, Slot
from app.services.errors import NotFound
from app.utils.time import a_minutos, desde_minutos, now, overlaps, today
from app.utils.vigencia import fecha_en_vigencia, motivo_participacion

# Un día tiene 1440 minutos y la duración mínima de un turno es 5: nunca puede haber más de
# 288 turnos legítimos. Cualquier cosa por encima de esto es un error de configuración.
MAX_SLOTS_POR_DIA = 288
# Tope de días que el portal muestra a la vez (cada día es una consulta de horarios).
MAX_DIAS_RESERVABLES = 31


@dataclass(frozen=True)
class Franja:
    hora_inicio: time
    hora_fin: time


@dataclass
class ResumenTurnos:
    """Disponibilidad agregada de una agenda en los días reservables del portal."""
    disponibles: int = 0
    proxima_fecha: date | None = None
    proxima_hora: time | None = None


def grilla_agenda(
    hora_inicio: time, hora_fin: time, duracion_minutos: int,
    almuerzo_inicio: time | None = None, almuerzo_fin: time | None = None,
) -> list[Franja]:
    """Turnos teóricos de una agenda (sin bloqueos ni reservas), en orden.

    Función pura: la usan la generación de disponibilidad y la validación de cambios de
    agenda con reservas existentes (ver AgendaService.actualizar), para que ambas partes
    hablen exactamente de la misma grilla.
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


def calcular_slots(
    agenda: Agenda, fecha: date, *, bloqueos: list, es_festivo: bool,
    ocupados: list[tuple[time, time]], ahora: datetime, incluir_pasado: bool = False,
) -> list[Slot]:
    """Estado de cada turno de `agenda` en `fecha` a partir de datos ya cargados.

    - `bloqueos`: los que aplican a esta agenda ese día (propios o globales).
    - `ocupados`: (inicio, fin) de las reservas ACTIVAS de la agenda ese día. La ocupación es
      por SOLAPAMIENTO, no por coincidencia exacta de la hora de inicio: una reserva que
      quedó fuera de la grilla actual sigue bloqueando cualquier turno que se cruce con ella.
    - `incluir_pasado=True` es la vista administrativa: reconstruye días pasados y muestra los
      días bloqueados/festivos con sus turnos marcados como BLOQUEADO en vez de vacíos.
    """
    hoy = ahora.date()
    es_pasado = fecha < hoy
    if es_pasado and not incluir_pasado:
        return []
    if fecha.weekday() not in agenda.dias:
        return []
    dia_bloqueado = es_festivo or any(b.tipo == "dia" for b in bloqueos)
    if dia_bloqueado and not incluir_pasado:
        return []
    rangos_bloqueados = [
        (b.hora_inicio, b.hora_fin) for b in bloqueos if b.tipo == "rango" and b.hora_inicio and b.hora_fin
    ]
    es_hoy = fecha == hoy

    slots: list[Slot] = []
    for franja in grilla_agenda(
        agenda.hora_inicio, agenda.hora_fin, agenda.duracion_minutos, agenda.almuerzo_inicio, agenda.almuerzo_fin,
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
        slots.append(Slot(hora_inicio=ini, hora_fin=fin, estado=estado, disponible=estado == EstadoSlot.DISPONIBLE))
    return slots


def calcular_fechas_reservables(hoy: date, inicio: date | None, fin: date | None) -> list[date]:
    """Días que el portal ofrece para reservar en un evento (única fuente de verdad: el
    detalle público del evento los entrega como `dias_reservables`):

    - Con vigencia: desde max(inicio, hoy) hasta el fin de la vigencia, con un máximo de 31
      días a la vista (ventana móvil si la vigencia es más larga). Si ya terminó, ninguno.
    - Sin vigencia (solo eventos antiguos que nunca tuvieron fechas): los días hábiles que
      quedan de esta semana o, si ya es fin de semana, los de la semana siguiente.
    """
    if inicio is None and fin is None:
        lunes = hoy - timedelta(days=hoy.weekday())
        restantes = [lunes + timedelta(days=i) for i in range(5) if lunes + timedelta(days=i) >= hoy]
        return restantes or [lunes + timedelta(days=7 + i) for i in range(5)]
    desde = max(inicio, hoy) if inicio else hoy
    hasta = fin if fin else desde + timedelta(days=MAX_DIAS_RESERVABLES - 1)
    if hasta < desde:
        return []
    return [desde + timedelta(days=i) for i in range(min((hasta - desde).days + 1, MAX_DIAS_RESERVABLES))]


class HorarioService:
    def __init__(self, db: Session):
        self.db = db
        self.agendas = AgendaRepository(db)
        self.bloqueos = BloqueoRepository(db)
        self.reservas = ReservaRepository(db)

    def generar(self, agenda_id: int, fecha: date, incluir_pasado: bool = False) -> list[Slot]:
        """Disponibilidad pública de una agenda para una fecha (o la vista administrativa del
        día con `incluir_pasado=True`, ver `calcular_slots`)."""
        agenda = self.agendas.get(agenda_id)
        if not agenda or not agenda.activo:
            raise NotFound("Agenda no encontrada o inactiva")
        if not incluir_pasado:
            # El evento o el área se desactivaron, o el evento está fuera de su vigencia: la
            # agenda deja de ofrecer turnos aunque su propio flag siga activo.
            motivo = motivo_no_reservable(agenda)
            if motivo:
                raise NotFound(motivo)

        ahora = now()
        if fecha < today() and not incluir_pasado:
            return []  # nunca hay turnos reservables en un día que ya pasó
        servicio = agenda.servicio
        if not incluir_pasado and not fecha_en_vigencia(servicio.vigencia_inicio, servicio.vigencia_fin, fecha):
            return []  # día fuera de la vigencia del evento

        return calcular_slots(
            agenda, fecha,
            bloqueos=self.bloqueos.por_agenda_fecha(agenda_id, fecha),
            es_festivo=self.bloqueos.es_festivo(fecha),
            ocupados=[(r.hora_inicio, r.hora_fin) for r in self.reservas.activas_por_agenda_fecha(agenda_id, fecha)],
            ahora=ahora,
            incluir_pasado=incluir_pasado,
        )

    @staticmethod
    def fechas_reservables(servicio: Servicio) -> list[date]:
        """Días que el portal ofrece para reservar en este evento (ver
        `calcular_fechas_reservables`)."""
        return calcular_fechas_reservables(today(), servicio.vigencia_inicio, servicio.vigencia_fin)

    def resumen_disponibilidad(self, agendas: list[Agenda], fechas: list[date]) -> dict[int, ResumenTurnos]:
        """Turnos disponibles y próximo turno libre de cada agenda en `fechas`, con TRES
        consultas en total (bloqueos, festivos y reservas de todas las agendas y días) en vez
        de varias por agenda y día. Mismas reglas que `generar` (ver `calcular_slots`)."""
        resultado = {a.id: ResumenTurnos() for a in agendas}
        if not agendas or not fechas:
            return resultado

        bloqueos_por_fecha: dict[date, list] = defaultdict(list)
        for b in self.bloqueos.por_fechas(fechas):
            bloqueos_por_fecha[b.fecha].append(b)
        festivos = self.bloqueos.festivos_en(fechas)
        ocupados: dict[tuple[int, date], list[tuple[time, time]]] = defaultdict(list)
        for r in self.reservas.activas_por_agendas_fechas([a.id for a in agendas], fechas):
            ocupados[(r.agenda_id, r.fecha)].append((r.hora_inicio, r.hora_fin))

        ahora = now()
        for agenda in agendas:
            resumen = resultado[agenda.id]
            for fecha in sorted(fechas):
                slots = calcular_slots(
                    agenda, fecha,
                    bloqueos=[b for b in bloqueos_por_fecha.get(fecha, []) if b.agenda_id in (None, agenda.id)],
                    es_festivo=fecha in festivos,
                    ocupados=ocupados.get((agenda.id, fecha), []),
                    ahora=ahora,
                )
                libres = [s for s in slots if s.estado == EstadoSlot.DISPONIBLE]
                resumen.disponibles += len(libres)
                if libres and resumen.proxima_fecha is None:
                    resumen.proxima_fecha, resumen.proxima_hora = fecha, libres[0].hora_inicio
        return resultado


def motivo_no_reservable(agenda: Agenda, hoy: date | None = None) -> str | None:
    """None si la agenda puede ofrecer turnos y recibir reservas hoy; si no, el motivo
    legible. Única fuente de verdad de esta regla (la usan el catálogo público, la
    disponibilidad y la creación de reservas, también la manual del administrador):

    - la agenda, su evento (servicio) y su área deben estar activos, y
    - el evento debe estar dentro de su vigencia (ni próximo ni finalizado).
    """
    servicio = agenda.servicio
    if not (agenda.activo and servicio.activo and agenda.area.activo):
        return "Este evento no está disponible para reservas en este momento."
    ahora = now()
    if hoy is not None:
        ahora = datetime.combine(hoy, ahora.time(), tzinfo=ahora.tzinfo)
    return motivo_participacion(servicio, ahora, "reservas")


def agenda_reservable(agenda: Agenda, hoy: date | None = None) -> bool:
    return motivo_no_reservable(agenda, hoy) is None
