"""Reglas de negocio de reservas: una reserva activa por usuario+evento+día (no global),
excepción, cancelación y reutilización del slot/día."""
from datetime import date, time, timedelta

import pytest

from app.models import Usuario
from app.services.errors import Conflict, DomainError, Forbidden, NotFound
from app.services.reserva_service import ReservaService


def _lunes_futuro() -> date:
    d = date.today() + timedelta(days=14)
    return d - timedelta(days=d.weekday())


def _reservar(db, agenda_id, fecha, hora: str, usuario_id: int):
    return ReservaService(db).crear(
        agenda_id=agenda_id, fecha=fecha, hora_inicio=time.fromisoformat(hora),
        usuario_id=usuario_id,
    )


def test_usuario_inactivo_no_puede_reservar(db, datos_base):
    usuario = db.get(Usuario, datos_base["usuario_id"])
    usuario.activo = False
    db.commit()

    with pytest.raises(NotFound):
        _reservar(db, datos_base["agenda_id"], _lunes_futuro(), "09:00:00", datos_base["usuario_id"])


def test_no_puede_reservar_el_mismo_evento_dos_veces_el_mismo_dia(db, datos_base):
    lunes = _lunes_futuro()
    _reservar(db, datos_base["agenda_id"], lunes, "09:00:00", datos_base["usuario_id"])

    with pytest.raises(Conflict):
        _reservar(db, datos_base["agenda_id"], lunes, "15:00:00", datos_base["usuario_id"])


def test_puede_reservar_otro_evento_el_mismo_dia(db, datos_base):
    lunes = _lunes_futuro()
    r1 = _reservar(db, datos_base["agenda_id"], lunes, "09:00:00", datos_base["usuario_id"])
    r2 = _reservar(db, datos_base["agenda2_id"], lunes, "09:00:00", datos_base["usuario_id"])
    assert r1.id != r2.id
    assert r1.servicio_id == datos_base["servicio_id"]
    assert r2.servicio_id == datos_base["servicio2_id"]


def test_puede_reservar_el_mismo_evento_en_otro_dia(db, datos_base):
    lunes = _lunes_futuro()
    martes = lunes + timedelta(days=1)
    r1 = _reservar(db, datos_base["agenda_id"], lunes, "09:00:00", datos_base["usuario_id"])
    r2 = _reservar(db, datos_base["agenda_id"], martes, "09:00:00", datos_base["usuario_id"])
    assert r1.id != r2.id


def test_excepcion_multiple_reservas_mismo_evento_mismo_dia(db, datos_base):
    lunes = _lunes_futuro()
    usuario = db.get(Usuario, datos_base["usuario_id"])
    usuario.permite_reservas_multiples = True
    db.commit()

    r1 = _reservar(db, datos_base["agenda_id"], lunes, "09:00:00", datos_base["usuario_id"])
    r2 = _reservar(db, datos_base["agenda_id"], lunes, "10:00:00", datos_base["usuario_id"])
    assert r1.id != r2.id

    # La excepción es un permiso persistente que el admin controla, no de un solo uso.
    usuario = db.get(Usuario, datos_base["usuario_id"])
    assert usuario.permite_reservas_multiples is True


def test_cancelar_libera_el_evento_del_dia_para_reutilizarlo(db, datos_base):
    lunes = _lunes_futuro()
    reserva = _reservar(db, datos_base["agenda_id"], lunes, "09:00:00", datos_base["usuario_id"])

    ReservaService(db).cancelar(reserva.id, admin_id=None, actor_nombre="test")

    # El mismo colaborador puede volver a reservar el mismo evento el mismo día (ya no tiene
    # una activa para ese evento).
    nueva = _reservar(db, datos_base["agenda_id"], lunes, "09:00:00", datos_base["usuario_id"])
    assert nueva.id != reserva.id
    assert nueva.hora_inicio.isoformat() == "09:00:00"


def test_cancelar_propia_solo_el_dueno(db, datos_base):
    lunes = _lunes_futuro()
    reserva = _reservar(db, datos_base["agenda_id"], lunes, "09:00:00", datos_base["usuario_id"])

    otro = Usuario(nombre="Otro", apellido="Colaborador")
    db.add(otro)
    db.commit()

    with pytest.raises(Forbidden):
        ReservaService(db).cancelar_propia(reserva.id, otro.id)

    cancelada = ReservaService(db).cancelar_propia(reserva.id, datos_base["usuario_id"])
    assert cancelada.estado == "cancelada"


def test_cancelar_propia_respeta_politica_de_horas_minimas(db, datos_base):
    from app.repositories.configuracion_repository import ConfiguracionRepository

    ConfiguracionRepository(db).set("cancelacion_horas_minimas", "999999")
    db.commit()

    # Una reserva muy en el futuro (14+ días) igual queda a menos de 999999 horas de distancia.
    reserva = _reservar(db, datos_base["agenda_id"], _lunes_futuro(), "09:00:00", datos_base["usuario_id"])

    with pytest.raises(DomainError):
        ReservaService(db).cancelar_propia(reserva.id, datos_base["usuario_id"])


def test_slot_ocupado_por_otro_usuario_da_conflicto(db, datos_base):
    lunes = _lunes_futuro()
    _reservar(db, datos_base["agenda_id"], lunes, "09:00:00", datos_base["usuario_id"])

    usuario2 = Usuario(nombre="Otro", apellido="Colaborador")
    db.add(usuario2)
    db.commit()

    with pytest.raises(Conflict):
        _reservar(db, datos_base["agenda_id"], lunes, "09:00:00", usuario2.id)


def test_horario_fuera_de_agenda_es_invalido(db, datos_base):
    lunes = _lunes_futuro()
    with pytest.raises(DomainError):
        _reservar(db, datos_base["agenda_id"], lunes, "23:00:00", datos_base["usuario_id"])


def test_agenda_inactiva_no_permite_reservar(db, datos_base):
    from app.models import Agenda
    agenda = db.get(Agenda, datos_base["agenda_id"])
    agenda.activo = False
    db.commit()

    with pytest.raises(DomainError):
        _reservar(db, datos_base["agenda_id"], _lunes_futuro(), "09:00:00", datos_base["usuario_id"])
