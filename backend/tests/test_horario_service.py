"""Pruebas unitarias de generación dinámica de horarios."""
from datetime import date, datetime, time, timedelta

import pytest

from app.models import Agenda, Bloqueo, Festivo
from app.services.errors import NotFound
from app.services.horario_service import HorarioService
from app.utils.time import TZ


def _lunes_futuro() -> date:
    d = date.today() + timedelta(days=14)
    return d - timedelta(days=d.weekday())  # próximo lunes, bien alejado de "hoy"


def _fijar_ahora(monkeypatch, fecha: date, hora: time):
    fijo = datetime.combine(fecha, hora, tzinfo=TZ)
    monkeypatch.setattr("app.services.horario_service.now", lambda: fijo)
    monkeypatch.setattr("app.services.horario_service.today", lambda: fecha)


def test_slots_dentro_de_horario_completo(datos_base, db, monkeypatch):
    lunes = _lunes_futuro()
    _fijar_ahora(monkeypatch, lunes - timedelta(days=1), time(0, 0))
    slots = HorarioService(db).generar(datos_base["agenda_id"], lunes)
    horas = [s.hora_inicio for s in slots]
    assert time(8, 0) in horas
    assert time(11, 30) in horas
    assert all(s.estado == "disponible" for s in slots)


def test_franja_final_incompleta_se_excluye(datos_base, db, monkeypatch):
    lunes = _lunes_futuro()
    _fijar_ahora(monkeypatch, lunes - timedelta(days=1), time(0, 0))
    agenda = db.get(Agenda, datos_base["agenda_id"])
    agenda.hora_fin = time(12, 15)  # con slots de 30 min, 12:00-12:30 se pasaría del cierre
    agenda.almuerzo_inicio = None
    agenda.almuerzo_fin = None
    db.commit()

    slots = HorarioService(db).generar(datos_base["agenda_id"], lunes)
    horas = [s.hora_inicio for s in slots]
    assert time(11, 30) in horas  # 11:30-12:00 sí cabe
    assert time(12, 0) not in horas  # 12:00-12:30 excede hora_fin=12:15


def test_almuerzo_total_se_excluye(datos_base, db, monkeypatch):
    lunes = _lunes_futuro()
    _fijar_ahora(monkeypatch, lunes - timedelta(days=1), time(0, 0))
    slots = HorarioService(db).generar(datos_base["agenda_id"], lunes)
    horas = [s.hora_inicio for s in slots]
    assert time(12, 0) not in horas
    assert time(12, 30) not in horas
    assert time(13, 0) in horas


def test_almuerzo_parcial_se_excluye(datos_base, db, monkeypatch):
    lunes = _lunes_futuro()
    _fijar_ahora(monkeypatch, lunes - timedelta(days=1), time(0, 0))
    agenda = db.get(Agenda, datos_base["agenda_id"])
    agenda.duracion_minutos = 45  # 11:45-12:30 solapa parcialmente el almuerzo 12:00-13:00
    db.commit()

    slots = HorarioService(db).generar(datos_base["agenda_id"], lunes)
    horas = [s.hora_inicio for s in slots]
    assert time(11, 45) not in horas


def test_bloqueo_rango_marca_slots_bloqueados(datos_base, db, monkeypatch):
    lunes = _lunes_futuro()
    _fijar_ahora(monkeypatch, lunes - timedelta(days=1), time(0, 0))
    db.add(Bloqueo(agenda_id=datos_base["agenda_id"], tipo="rango", fecha=lunes,
                    hora_inicio=time(9, 0), hora_fin=time(10, 0), motivo="Mantenimiento"))
    db.commit()

    slots = HorarioService(db).generar(datos_base["agenda_id"], lunes)
    por_hora = {s.hora_inicio: s.estado for s in slots}
    assert por_hora[time(9, 0)] == "bloqueado"
    assert por_hora[time(9, 30)] == "bloqueado"
    assert por_hora[time(10, 0)] == "disponible"


def test_bloqueo_dia_completo_deja_sin_slots(datos_base, db, monkeypatch):
    lunes = _lunes_futuro()
    _fijar_ahora(monkeypatch, lunes - timedelta(days=1), time(0, 0))
    db.add(Bloqueo(agenda_id=datos_base["agenda_id"], tipo="dia", fecha=lunes, motivo="Cierre"))
    db.commit()

    slots = HorarioService(db).generar(datos_base["agenda_id"], lunes)
    assert slots == []


def test_festivo_deja_sin_slots(datos_base, db, monkeypatch):
    lunes = _lunes_futuro()
    _fijar_ahora(monkeypatch, lunes - timedelta(days=1), time(0, 0))
    db.add(Festivo(fecha=lunes, nombre="Festivo de prueba", estado=True))
    db.commit()

    slots = HorarioService(db).generar(datos_base["agenda_id"], lunes)
    assert slots == []


def test_hora_pasada_hoy_se_marca_pasado(datos_base, db, monkeypatch):
    lunes = _lunes_futuro()
    _fijar_ahora(monkeypatch, lunes, time(10, 0))  # "hoy" es el lunes, son las 10:00
    slots = HorarioService(db).generar(datos_base["agenda_id"], lunes)
    por_hora = {s.hora_inicio: s.estado for s in slots}
    assert por_hora[time(8, 0)] == "pasado"
    assert por_hora[time(9, 30)] == "pasado"
    assert por_hora[time(10, 30)] == "disponible"


def test_fecha_completamente_pasada_no_tiene_slots(datos_base, db, monkeypatch):
    lunes = _lunes_futuro()
    _fijar_ahora(monkeypatch, lunes, time(10, 0))
    slots = HorarioService(db).generar(datos_base["agenda_id"], lunes - timedelta(days=1))
    assert slots == []


def test_agenda_inactiva_lanza_not_found(datos_base, db, monkeypatch):
    lunes = _lunes_futuro()
    _fijar_ahora(monkeypatch, lunes - timedelta(days=1), time(0, 0))
    agenda = db.get(Agenda, datos_base["agenda_id"])
    agenda.activo = False
    db.commit()

    with pytest.raises(NotFound):
        HorarioService(db).generar(datos_base["agenda_id"], lunes)
