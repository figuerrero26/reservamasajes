"""Generación dinámica de horarios.

Los slots NO se almacenan: se calculan a partir de la configuración de la agenda,
aplicando las reglas de casos límite y la zona horaria America/Bogota.
"""
from datetime import date, time

from sqlalchemy.orm import Session

from app.models import Agenda
from app.repositories.agenda_repository import AgendaRepository
from app.repositories.bloqueo_repository import BloqueoRepository
from app.repositories.configuracion_repository import ConfiguracionRepository
from app.repositories.reserva_repository import ReservaRepository
from app.schemas.reserva import EstadoSlot, Slot
from app.services.errors import NotFound
from app.utils.time import add_minutes, overlaps, now, today


class HorarioService:
    def __init__(self, db: Session):
        self.db = db
        self.agendas = AgendaRepository(db)
        self.bloqueos = BloqueoRepository(db)
        self.reservas = ReservaRepository(db)
        self.configuracion = ConfiguracionRepository(db)

    def generar(self, agenda_id: int, fecha: date, incluir_pasado: bool = False) -> list[Slot]:
        """`incluir_pasado=True` reconstruye los turnos de un día ya pasado (todos marcados
        como PASADO salvo que estén ocupados/bloqueados) en vez de devolver una lista vacía.
        Solo lo usa la vista administrativa "por día" (ver ReservaService.dia) para revisar
        el historial; el flujo público de reserva nunca debe ver ni ofrecer días pasados."""
        agenda = self.agendas.get(agenda_id)
        if not agenda or not agenda.activo:
            raise NotFound("Agenda no encontrada o inactiva")

        es_pasado = fecha < today()
        # Fecha completamente pasada: nunca hay slots reservables (no solo los del propio
        # día en curso), salvo que se pida explícitamente el histórico.
        if es_pasado and not incluir_pasado:
            return []

        # Fuera de la semana activa configurada por el admin (si hay una definida): sin slots.
        inicio = self.configuracion.get("semana_activa_inicio")
        fin = self.configuracion.get("semana_activa_fin")
        if inicio and (fecha < date.fromisoformat(inicio)):
            return []
        if fin and (fecha > date.fromisoformat(fin)):
            return []

        # Día no habilitado en la configuración de la agenda: sin slots.
        if fecha.weekday() not in agenda.dias:
            return []
        # Festivo o día bloqueado completo: sin slots.
        if self.bloqueos.es_festivo(fecha):
            return []
        bloqueos = self.bloqueos.por_agenda_fecha(agenda_id, fecha)
        if any(b.tipo == "dia" for b in bloqueos):
            return []
        rangos_bloqueados = [
            (b.hora_inicio, b.hora_fin)
            for b in bloqueos
            if b.tipo == "rango" and b.hora_inicio and b.hora_fin
        ]

        ocupados = {r.hora_inicio for r in self.reservas.activas_por_agenda_fecha(agenda_id, fecha)}
        ahora = now()
        es_hoy = fecha == today()

        return self._construir_slots(agenda, fecha, ocupados, rangos_bloqueados, es_hoy, ahora.time(), es_pasado)

    def _construir_slots(self, agenda: Agenda, fecha: date, ocupados: set,
                         rangos_bloqueados: list, es_hoy: bool, hora_actual: time,
                         es_pasado: bool = False) -> list[Slot]:
        slots: list[Slot] = []
        cursor = agenda.hora_inicio
        dur = agenda.duracion_minutos

        while True:
            fin = add_minutes(cursor, dur)
            # Caso límite: la franja final incompleta se descarta (fin > hora_fin).
            if fin > agenda.hora_fin:
                break

            # Solape con almuerzo (total o parcial): la franja no existe como slot.
            en_almuerzo = bool(
                agenda.almuerzo_inicio and agenda.almuerzo_fin
                and overlaps(cursor, fin, agenda.almuerzo_inicio, agenda.almuerzo_fin)
            )
            if not en_almuerzo:
                bloqueado = any(
                    overlaps(cursor, fin, b_ini, b_fin) for b_ini, b_fin in rangos_bloqueados
                )
                pasado = es_pasado or (es_hoy and cursor <= hora_actual)
                ocupado = cursor in ocupados

                if bloqueado:
                    estado = EstadoSlot.BLOQUEADO
                elif ocupado:
                    estado = EstadoSlot.OCUPADO
                elif pasado:
                    estado = EstadoSlot.PASADO
                else:
                    estado = EstadoSlot.DISPONIBLE

                slots.append(Slot(
                    hora_inicio=cursor,
                    hora_fin=fin,
                    estado=estado,
                    disponible=estado == EstadoSlot.DISPONIBLE,
                ))

            cursor = fin

        return slots
