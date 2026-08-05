"""Generación dinámica de horarios (§9 del spec).

Los slots NO se almacenan: se calculan a partir de la configuración de la agenda,
aplicando las reglas de casos límite y la zona horaria America/Bogota.
"""
from datetime import date, time

from sqlalchemy.orm import Session

from app.models import Agenda
from app.repositories.agenda_repository import AgendaRepository
from app.repositories.bloqueo_repository import BloqueoRepository
from app.repositories.reserva_repository import ReservaRepository
from app.schemas.reserva import Slot
from app.services.errors import NotFound
from app.utils.time import add_minutes, overlaps, now, today


class HorarioService:
    def __init__(self, db: Session):
        self.db = db
        self.agendas = AgendaRepository(db)
        self.bloqueos = BloqueoRepository(db)
        self.reservas = ReservaRepository(db)

    def generar(self, agenda_id: int, fecha: date) -> list[Slot]:
        agenda = self.agendas.get(agenda_id)
        if not agenda or not agenda.estado:
            raise NotFound("Agenda no encontrada o inactiva")

        # Día no habilitado en la configuración de la agenda.
        if fecha.weekday() not in agenda.dias:
            return []
        # Festivo (RF-19) o día bloqueado completo (RF-14).
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

        return self._construir_slots(agenda, fecha, ocupados, rangos_bloqueados, es_hoy, ahora.time())

    def _construir_slots(self, agenda: Agenda, fecha: date, ocupados: set,
                         rangos_bloqueados: list, es_hoy: bool, hora_actual: time) -> list[Slot]:
        slots: list[Slot] = []
        cursor = agenda.hora_inicio
        dur = agenda.duracion_min

        while True:
            fin = add_minutes(cursor, dur)
            # Caso límite: la franja final incompleta se descarta (fin > hora_fin).
            if fin > agenda.hora_fin:
                break

            excluir = False
            # Solape con almuerzo (total o parcial) -> excluir (RF-10).
            if agenda.almuerzo_inicio and agenda.almuerzo_fin:
                if overlaps(cursor, fin, agenda.almuerzo_inicio, agenda.almuerzo_fin):
                    excluir = True
            # Solape con rangos bloqueados (RF-15).
            for b_ini, b_fin in rangos_bloqueados:
                if overlaps(cursor, fin, b_ini, b_fin):
                    excluir = True
                    break
            # Horario pasado (RF-11), evaluado en America/Bogota.
            if es_hoy and cursor <= hora_actual:
                excluir = True

            if not excluir:
                slots.append(Slot(
                    hora_inicio=cursor,
                    hora_fin=fin,
                    disponible=cursor not in ocupados,
                ))

            cursor = fin

        return slots
