"""Integración (MariaDB real): vigencia de los eventos y reglas de participación por evento.

Escenarios pedidos para esta entrega:
- evento próximo, evento en su periodo activo y evento con la fecha de fin ya pasada;
- evento con reservas futuras al finalizar y actividad con inscripciones al finalizar (se
  conservan intactas; cancelarlas es una operación aparte);
- reserva e inscripción nuevas después de la fecha de fin (rechazadas, también las manuales);
- historial de los eventos finalizados para el administrador;
- límites de participación por persona (una sola vez, por día, por semana), contados sobre
  el historial no cancelado, con la excepción por usuario;
- la tarea programada que registra el fin de vigencia (sin tocar nada más), la carga de
  imágenes de eventos y el traslado de datos de la migración 0012.
"""
import importlib.util
import os
import time as reloj
from datetime import date, datetime, time, timedelta
from pathlib import Path

import pytest
from sqlalchemy import text

from app.database.session import SessionLocal
from app.models import (
    Actividad, Auditoria, ConfiguracionGeneral, EstadoInscripcion, EstadoReserva, Inscripcion, Reserva, Servicio,
    Sesion, Usuario,
)
from app.services import imagen_service
from app.services.tareas_programadas import registrar_finalizaciones
from app.utils.time import today

API = "/api/v1"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def _en(dias: int) -> date:
    # Fecha de la APLICACIÓN (America/Bogota), no la del equipo: el contenedor suele estar en
    # UTC y de noche su "hoy" ya sería mañana para la vigencia.
    return today() + timedelta(days=dias)


def _lunes_futuro() -> date:
    d = today() + timedelta(days=14)
    return d - timedelta(days=d.weekday())


def _vigencia(client, headers_admin, servicio_id: int, inicio: date, fin: date, **extra) -> dict:
    r = client.put(f"{API}/servicios/{servicio_id}", headers=headers_admin,
                   json={"vigencia_inicio": inicio.isoformat(), "vigencia_fin": fin.isoformat(), **extra})
    assert r.status_code == 200, r.text
    return r.json()


def _reservar(client, headers, agenda_id: int, fecha: date, hora: str = "09:00"):
    return client.post(f"{API}/reservas", headers=headers,
                       json={"agenda_id": agenda_id, "fecha": fecha.isoformat(), "hora_inicio": hora})


def _verificar(client, headers, agenda_id: int, fecha: date) -> dict:
    r = client.get(f"{API}/reservas/verificar", headers=headers, params={"agenda_id": agenda_id, "fecha": fecha.isoformat()})
    assert r.status_code == 200, r.text
    return r.json()


def _catalogo(client) -> list[int]:
    return [e["id"] for e in client.get(f"{API}/eventos").json()]


def _estado_reserva(reserva_id: int) -> str:
    db = SessionLocal()
    try:
        return db.get(Reserva, reserva_id).estado
    finally:
        db.close()


def _finalizar_con_la_tarea() -> list:
    db = SessionLocal()
    try:
        return registrar_finalizaciones(db)
    finally:
        db.close()


def _crear_actividad(client, headers_admin, area_id: int, **extra) -> dict:
    r = client.post(f"{API}/actividades", headers=headers_admin, json={
        "area_id": area_id, "nombre": "Caminata ecológica",
        "vigencia_inicio": _en(0).isoformat(), "vigencia_fin": _en(30).isoformat(), **extra,
    })
    assert r.status_code == 201, r.text
    return r.json()


def _crear_sesion(client, headers_admin, actividad_id: int, dias: int, hora: str = "08:00", cupo: int = 10) -> dict:
    fin = f"{int(hora[:2]) + 2:02d}{hora[2:]}"
    r = client.post(f"{API}/actividades/{actividad_id}/sesiones", headers=headers_admin, json={
        "fecha": _en(dias).isoformat(), "hora_inicio": hora, "hora_fin": fin, "cupo_maximo": cupo,
    })
    assert r.status_code == 201, r.text
    return r.json()


def _inscribir(client, headers, sesion_id: int):
    return client.post(f"{API}/inscripciones", headers=headers, json={"sesion_id": sesion_id})


# ---- Evento próximo -----------------------------------------------------------------------------

def test_evento_proximo_ya_publicado_no_recibe_reservas(client, datos_base, headers_admin, headers_usuario):
    sid, aid = datos_base["servicio_id"], datos_base["agenda_id"]
    datos = _vigencia(client, headers_admin, sid, _en(5), _en(20))
    assert datos["estado_vigencia"] == "proximo"

    assert sid in _catalogo(client)
    r = client.get(f"{API}/eventos/{sid}")
    assert r.status_code == 200 and "abre sus reservas" in r.json()["motivo_no_disponible"]
    assert r.json()["dias_reservables"] == []
    assert aid in [a["id"] for a in client.get(f"{API}/agendas/publicas").json()]
    assert client.get(f"{API}/agendas/{aid}/horarios", params={"fecha": _en(6).isoformat()}).status_code == 404

    r = _reservar(client, headers_usuario, aid, _en(6))
    assert r.status_code == 400 and "abre sus reservas" in r.json()["detail"]
    r = client.post(f"{API}/reservas/manual", headers=headers_admin, json={
        "correo": "colaborador.demo@example.com", "agenda_id": aid, "fecha": _en(6).isoformat(), "hora_inicio": "09:00",
    })
    assert r.status_code == 400
    assert _verificar(client, headers_usuario, aid, _en(6))["permitido"] is False

    # El panel lo consulta como próximo.
    proximos = client.get(f"{API}/servicios", headers=headers_admin, params={"estado": "proximo"}).json()
    assert [s["id"] for s in proximos] == [sid]


# ---- Evento en su periodo activo ----------------------------------------------------------------

def test_evento_vigente_recibe_reservas_solo_dentro_de_su_periodo(client, datos_base, headers_admin, headers_usuario):
    sid, aid = datos_base["servicio_id"], datos_base["agenda_id"]
    datos = _vigencia(client, headers_admin, sid, _en(0), _en(10))
    assert datos["estado_vigencia"] == "vigente"
    assert sid in _catalogo(client)
    detalle = client.get(f"{API}/eventos/{sid}").json()
    assert detalle["dias_reservables"][0] == _en(0).isoformat()
    assert detalle["dias_reservables"][-1] == _en(10).isoformat()

    assert _verificar(client, headers_usuario, aid, _en(3)) == {"permitido": True, "motivo": None}
    assert _reservar(client, headers_usuario, aid, _en(3)).status_code == 201
    # Regla del evento (una por día): el mismo día ya no; otro día sí.
    assert _verificar(client, headers_usuario, aid, _en(3))["permitido"] is False
    assert _verificar(client, headers_usuario, aid, _en(4))["permitido"] is True

    # El último día de la vigencia todavía se puede reservar; el siguiente ya no.
    assert _reservar(client, headers_usuario, aid, _en(10)).status_code == 201
    assert client.get(f"{API}/agendas/{aid}/horarios", params={"fecha": _en(11).isoformat()}).json()["slots"] == []
    r = _reservar(client, headers_usuario, aid, _en(11))
    assert r.status_code == 400 and "solo recibe reservas" in r.json()["detail"]

    vigentes = client.get(f"{API}/servicios", headers=headers_admin, params={"estado": "vigente"}).json()
    assert [s["id"] for s in vigentes] == [sid]


# ---- Evento cuya fecha de fin ya pasó -----------------------------------------------------------

def test_evento_finalizado_permanece_publicado_y_no_recibe_reservas(client, datos_base, headers_admin, headers_usuario):
    sid, aid = datos_base["servicio_id"], datos_base["agenda_id"]
    datos = _vigencia(client, headers_admin, sid, _en(-10), _en(-1))
    assert datos["estado_vigencia"] == "finalizado" and datos["activo"] is True

    assert sid in _catalogo(client)
    r = client.get(f"{API}/eventos/{sid}")
    assert r.status_code == 200 and "finalizó" in r.json()["motivo_no_disponible"]
    assert client.get(f"{API}/agendas/{aid}/horarios", params={"fecha": _en(2).isoformat()}).status_code == 404
    finalizados = client.get(f"{API}/servicios", headers=headers_admin, params={"estado": "finalizado"}).json()
    assert [s["id"] for s in finalizados] == [sid]
    # El otro evento (sin vigencia definida, anterior a la migración) sigue igual.
    assert datos_base["servicio2_id"] in _catalogo(client)


# ---- Reserva nueva después de la fecha de fin ---------------------------------------------------

def test_reserva_nueva_despues_del_fin_se_rechaza(client, datos_base, headers_admin, headers_usuario):
    sid, aid = datos_base["servicio_id"], datos_base["agenda_id"]
    _vigencia(client, headers_admin, sid, _en(-10), _en(-1))
    r = _reservar(client, headers_usuario, aid, _en(2))
    assert r.status_code == 400 and "finalizó" in r.json()["detail"]
    r = client.post(f"{API}/reservas/manual", headers=headers_admin, json={
        "correo": "colaborador.demo@example.com", "agenda_id": aid, "fecha": _en(2).isoformat(), "hora_inicio": "09:00",
    })
    assert r.status_code == 400  # tampoco el administrador
    assert _verificar(client, headers_usuario, aid, _en(2))["permitido"] is False


# ---- Evento con reservas futuras al finalizar --------------------------------------------------

def test_finalizar_con_reservas_futuras_las_conserva(client, datos_base, headers_admin, headers_usuario):
    sid, aid = datos_base["servicio_id"], datos_base["agenda_id"]
    _vigencia(client, headers_admin, sid, _en(0), _en(30))
    reserva = _reservar(client, headers_usuario, aid, _en(5)).json()

    # El administrador termina el evento antes: la reserva futura queda fuera de la vigencia,
    # se informa y se conserva.
    datos = _vigencia(client, headers_admin, sid, _en(-3), _en(-1))
    assert datos["estado_vigencia"] == "finalizado"
    assert [x["id"] for x in datos["reservas_afectadas"]] == [reserva["id"]]
    assert _estado_reserva(reserva["id"]) == EstadoReserva.ACTIVA.value

    # La tarea programada registra el fin sin tocar la reserva ni el flag del evento.
    assert ("servicio", sid) in _finalizar_con_la_tarea()
    assert _estado_reserva(reserva["id"]) == EstadoReserva.ACTIVA.value
    db = SessionLocal()
    try:
        servicio = db.get(Servicio, sid)
        assert servicio.finalizado_en is not None and servicio.activo is True
        registro = db.query(Auditoria).filter_by(accion="finalizar_por_vigencia", entidad="servicio", entidad_id=sid).one()
        assert registro.datos_nuevos["reservas_activas"] == 1
    finally:
        db.close()
    assert _finalizar_con_la_tarea() == []  # una sola vez

    # El colaborador conserva su reserva y puede cancelarla él mismo.
    mia = client.get(f"{API}/reservas/mias", headers=headers_usuario).json()[0]
    assert mia["id"] == reserva["id"] and mia["estado"] == "activa" and mia["puede_cancelar"] is True
    # Cancelar es una operación aparte y explícita del administrador.
    r = client.post(f"{API}/reservas/cancelar-lote", headers=headers_admin,
                    json={"reserva_ids": [reserva["id"]], "motivo": "El evento terminó antes", "notificar": False})
    assert r.json()["canceladas"] == [reserva["id"]]


# ---- Actividad con inscripciones al finalizar ---------------------------------------------------

def test_actividad_finalizada_conserva_sus_inscripciones(client, datos_base, headers_admin, headers_usuario):
    act = _crear_actividad(client, headers_admin, datos_base["area_id"])
    sesion = _crear_sesion(client, headers_admin, act["id"], dias=10)
    insc = _inscribir(client, headers_usuario, sesion["id"])
    assert insc.status_code == 201, insc.text

    r = client.put(f"{API}/actividades/{act['id']}", headers=headers_admin,
                   json={"vigencia_inicio": _en(-5).isoformat(), "vigencia_fin": _en(-1).isoformat()})
    assert r.status_code == 200, r.text
    datos = r.json()
    assert datos["estado_vigencia"] == "finalizado" and datos["estado_inscripcion"] == "finalizada"
    assert datos["resumen"]["inscritos_futuros"] == 1  # la sesión futura sigue con su inscrito

    assert ("actividad", act["id"]) in _finalizar_con_la_tarea()
    db = SessionLocal()
    try:
        assert db.get(Inscripcion, insc.json()["id"]).estado == EstadoInscripcion.ACTIVA.value
        registro = db.query(Auditoria).filter_by(accion="finalizar_por_vigencia", entidad="actividad").one()
        assert registro.datos_nuevos["inscripciones_por_estado"] == {"activa": 1}
    finally:
        db.close()

    # El evento sigue publicado y el participante y el administrador conservan todo.
    assert act["id"] in [a["id"] for a in client.get(f"{API}/actividades/publicas").json()]
    r = client.get(f"{API}/actividades/publicas/{act['id']}")
    assert r.status_code == 200 and "finalizó" in r.json()["motivo_no_disponible"]
    mia = client.get(f"{API}/inscripciones/mias", headers=headers_usuario).json()[0]
    assert mia["estado"] == "activa" and mia["puede_cancelar"] is True
    inscritos = client.get(f"{API}/inscripciones", headers=headers_admin, params={"actividad_id": act["id"]}).json()
    assert [i["id"] for i in inscritos] == [insc.json()["id"]]


# ---- Inscripción nueva después de la fecha de fin -----------------------------------------------

def test_inscripcion_nueva_despues_del_fin_se_rechaza(client, datos_base, headers_admin, headers_usuario):
    act = _crear_actividad(client, headers_admin, datos_base["area_id"])
    sesion = _crear_sesion(client, headers_admin, act["id"], dias=10)
    client.put(f"{API}/actividades/{act['id']}", headers=headers_admin,
               json={"vigencia_inicio": _en(-5).isoformat(), "vigencia_fin": _en(-1).isoformat()})
    r = _inscribir(client, headers_usuario, sesion["id"])
    assert r.status_code == 400 and "finalizó" in r.json()["detail"]
    r = client.post(f"{API}/inscripciones/manual", headers=headers_admin,
                    json={"correo": "colaborador.demo@example.com", "sesion_id": sesion["id"]})
    assert r.status_code == 400  # tampoco el administrador
    sesiones = client.get(f"{API}/actividades/publicas/{act['id']}/sesiones")
    assert sesiones.status_code == 200 and sesiones.json()[0]["estado"] == "cerrada"


# ---- Historial de eventos finalizados -----------------------------------------------------------

def test_historial_de_eventos_finalizados(client, datos_base, headers_admin, headers_usuario, db):
    sid, aid = datos_base["servicio_id"], datos_base["agenda_id"]
    _vigencia(client, headers_admin, sid, _en(-10), _en(30))
    cancelada = _reservar(client, headers_usuario, aid, _en(2)).json()
    client.post(f"{API}/reservas/{cancelada['id']}/cancelar", headers=headers_usuario)
    activa = _reservar(client, headers_usuario, aid, _en(3)).json()
    pasada = _reservar(client, headers_usuario, aid, _en(4)).json()
    fila = db.get(Reserva, pasada["id"])
    fila.fecha = _en(-2)  # ya ocurrió, pero sigue activa: no se valida asistencia
    db.commit()

    act = _crear_actividad(client, headers_admin, datos_base["area_id"])
    sesion = _crear_sesion(client, headers_admin, act["id"], dias=6)
    _inscribir(client, headers_usuario, sesion["id"])

    _vigencia(client, headers_admin, sid, _en(-10), _en(-1))
    client.put(f"{API}/actividades/{act['id']}", headers=headers_admin,
               json={"vigencia_inicio": _en(-5).isoformat(), "vigencia_fin": _en(-1).isoformat()})

    finalizados = client.get(f"{API}/servicios", headers=headers_admin, params={"estado": "finalizado"}).json()
    assert [s["id"] for s in finalizados] == [sid]
    historial = client.get(f"{API}/reservas", headers=headers_admin, params={"servicio_id": sid}).json()
    assert {r["id"]: r["estado"] for r in historial} == {
        cancelada["id"]: "cancelada", activa["id"]: "activa", pasada["id"]: "activa",
    }
    actividades = client.get(f"{API}/actividades", headers=headers_admin, params={"estado": "finalizado"}).json()
    assert [a["id"] for a in actividades] == [act["id"]]
    assert len(client.get(f"{API}/inscripciones", headers=headers_admin, params={"actividad_id": act["id"]}).json()) == 1
    assert client.get(f"{API}/actividades", headers=headers_admin, params={"estado": "vigente"}).json() == []


# ---- Límites de participación de los eventos por turnos -----------------------------------------

def test_una_sola_reserva_durante_toda_la_vigencia(client, datos_base, headers_admin, headers_usuario, db):
    sid, aid = datos_base["servicio_id"], datos_base["agenda_id"]
    datos = _vigencia(client, headers_admin, sid, _en(-5), _en(30), limite_participaciones=1, periodo_limite="evento")
    assert datos["regla_participacion"] == "Una sola reserva por persona durante toda la vigencia del evento."
    assert next(e for e in client.get(f"{API}/eventos").json() if e["id"] == sid)["regla_participacion"] == datos["regla_participacion"]

    primera = _reservar(client, headers_usuario, aid, _en(2))
    assert primera.status_code == 201
    r = _reservar(client, headers_usuario, aid, _en(5))
    assert r.status_code == 409 and "solo se permite una por persona" in r.json()["detail"]
    assert _verificar(client, headers_usuario, aid, _en(5))["permitido"] is False
    r = client.post(f"{API}/reservas/manual", headers=headers_admin, json={
        "correo": "colaborador.demo@example.com", "agenda_id": aid, "fecha": _en(5).isoformat(), "hora_inicio": "09:00",
    })
    assert r.status_code == 409 and r.json()["detail"].startswith("El colaborador ya tiene")

    # Lo cancelado no cuenta…
    client.post(f"{API}/reservas/{primera.json()['id']}/cancelar", headers=headers_usuario)
    segunda = _reservar(client, headers_usuario, aid, _en(5))
    assert segunda.status_code == 201
    # …pero lo que ya ocurrió sí (historial de participación), aunque siga activa.
    fila = db.get(Reserva, segunda.json()["id"])
    fila.fecha = _en(-1)
    db.commit()
    assert _reservar(client, headers_usuario, aid, _en(7)).status_code == 409

    # Excepción por usuario: puede superar el límite.
    usuario = db.get(Usuario, datos_base["usuario_id"])
    usuario.permite_reservas_multiples = True
    db.commit()
    assert _reservar(client, headers_usuario, aid, _en(7)).status_code == 201


def test_limite_semanal_en_dias_distintos(client, datos_base, headers_admin, headers_usuario):
    sid, aid = datos_base["servicio_id"], datos_base["agenda_id"]
    datos = _vigencia(client, headers_admin, sid, _en(0), _en(60), limite_participaciones=2, periodo_limite="semana")
    assert datos["regla_participacion"] == "Hasta 2 reservas por persona por semana, en días distintos."
    lunes = _lunes_futuro()
    assert _reservar(client, headers_usuario, aid, lunes).status_code == 201
    assert _reservar(client, headers_usuario, aid, lunes, "15:00").status_code == 409  # mismo día
    assert _reservar(client, headers_usuario, aid, lunes + timedelta(days=1)).status_code == 201
    r = _reservar(client, headers_usuario, aid, lunes + timedelta(days=2))
    assert r.status_code == 409 and "máximo de 2 reservas" in r.json()["detail"]
    assert _reservar(client, headers_usuario, aid, lunes + timedelta(days=7)).status_code == 201  # otra semana

    # En los eventos por turnos no existe "varias el mismo día".
    r = client.put(f"{API}/servicios/{sid}", headers=headers_admin, json={"limite_participaciones": 2, "periodo_limite": "dia"})
    assert r.status_code == 400
    # "Sin límite adicional" equivale a una por día.
    r = client.put(f"{API}/servicios/{sid}", headers=headers_admin, json={"limite_participaciones": None})
    assert (r.json()["limite_participaciones"], r.json()["periodo_limite"]) == (1, "dia")


def test_crear_evento_con_vigencia_y_regla(client, datos_base, headers_admin):
    cuerpo = {
        "nombre": "Yoga", "vigencia_inicio": _en(0).isoformat(), "vigencia_fin": _en(14).isoformat(),
        "limite_participaciones": 1, "periodo_limite": "evento",
        "agenda": {"area_id": datos_base["area_id"], "hora_inicio": "08:00", "hora_fin": "12:00", "duracion_minutos": 30},
    }
    r = client.post(f"{API}/servicios", headers=headers_admin, json=cuerpo)
    assert r.status_code == 201, r.text
    assert (r.json()["estado_vigencia"], r.json()["periodo_limite"]) == ("vigente", "evento")
    # Sin vigencia o con una vigencia ya terminada no se crea.
    sin = {k: v for k, v in cuerpo.items() if k not in ("vigencia_inicio", "vigencia_fin")}
    assert client.post(f"{API}/servicios", headers=headers_admin, json={**sin, "nombre": "Otro"}).status_code == 422
    r = client.post(f"{API}/servicios", headers=headers_admin, json={
        **cuerpo, "nombre": "Otro", "vigencia_inicio": _en(-9).isoformat(), "vigencia_fin": _en(-2).isoformat(),
    })
    assert r.status_code == 400
    # Al editar, las fechas no pueden quedar vacías.
    r = client.put(f"{API}/servicios/{datos_base['servicio_id']}", headers=headers_admin, json={"vigencia_fin": None})
    assert r.status_code == 400


# ---- Límites de participación de las actividades ------------------------------------------------

def test_una_sola_inscripcion_por_actividad(client, datos_base, headers_admin, headers_usuario):
    act = _crear_actividad(client, headers_admin, datos_base["area_id"], limite_participaciones=1, periodo_limite="evento")
    s1 = _crear_sesion(client, headers_admin, act["id"], dias=5)
    s2 = _crear_sesion(client, headers_admin, act["id"], dias=8)
    sesiones = client.get(f"{API}/actividades/publicas/{act['id']}/sesiones", headers=headers_usuario).json()
    assert [s["puede_inscribirse"] for s in sesiones] == [True, True]

    insc = _inscribir(client, headers_usuario, s1["id"])
    assert insc.status_code == 201
    sesiones = {s["id"]: s for s in client.get(f"{API}/actividades/publicas/{act['id']}/sesiones", headers=headers_usuario).json()}
    assert sesiones[s1["id"]]["inscrito"] is True and sesiones[s1["id"]]["puede_inscribirse"] is False
    assert sesiones[s2["id"]]["puede_inscribirse"] is False
    assert "solo se permite una por persona" in sesiones[s2["id"]]["motivo_no_disponible"]

    r = _inscribir(client, headers_usuario, s2["id"])
    assert r.status_code == 409
    r = client.post(f"{API}/inscripciones/manual", headers=headers_admin,
                    json={"correo": "colaborador.demo@example.com", "sesion_id": s2["id"]})
    assert r.status_code == 409 and r.json()["detail"].startswith("El colaborador ya tiene")
    # Cancelar libera la participación.
    client.post(f"{API}/inscripciones/{insc.json()['id']}/cancelar", headers=headers_usuario)
    assert _inscribir(client, headers_usuario, s2["id"]).status_code == 201


def test_una_inscripcion_por_dia_y_actividades_sin_limite(client, datos_base, headers_admin, headers_usuario):
    act = _crear_actividad(client, headers_admin, datos_base["area_id"], limite_participaciones=1, periodo_limite="dia")
    manana = _crear_sesion(client, headers_admin, act["id"], dias=5, hora="08:00")
    tarde = _crear_sesion(client, headers_admin, act["id"], dias=5, hora="14:00")
    otro_dia = _crear_sesion(client, headers_admin, act["id"], dias=6)
    assert _inscribir(client, headers_usuario, manana["id"]).status_code == 201
    r = _inscribir(client, headers_usuario, tarde["id"])
    assert r.status_code == 409 and "para ese día" in r.json()["detail"]
    assert _inscribir(client, headers_usuario, otro_dia["id"]).status_code == 201

    # Por defecto (como hasta ahora) no hay límite: solo una inscripción por sesión.
    libre = _crear_actividad(client, headers_admin, datos_base["area_id"], nombre="Taller libre")
    assert libre["regla_participacion"].startswith("Sin límite")
    a = _crear_sesion(client, headers_admin, libre["id"], dias=5, hora="08:00")
    b = _crear_sesion(client, headers_admin, libre["id"], dias=5, hora="14:00")
    assert _inscribir(client, headers_usuario, a["id"]).status_code == 201
    assert _inscribir(client, headers_usuario, b["id"]).status_code == 201
    assert _inscribir(client, headers_usuario, b["id"]).status_code == 409  # misma sesión


# ---- Tarea programada ---------------------------------------------------------------------------

def test_tarea_programada_marca_una_vez_y_reprogramar_reabre(client, datos_base, headers_admin):
    sid = datos_base["servicio_id"]
    _vigencia(client, headers_admin, sid, _en(-10), _en(-1))
    assert _finalizar_con_la_tarea() == [("servicio", sid)]
    assert _finalizar_con_la_tarea() == []
    # Extender la vigencia lo reabre y limpia la marca (se registrará de nuevo al terminar).
    datos = _vigencia(client, headers_admin, sid, _en(-10), _en(10))
    assert datos["estado_vigencia"] == "vigente" and datos["finalizado_en"] is None
    assert sid in _catalogo(client)


# ---- Imágenes de eventos ------------------------------------------------------------------------

@pytest.fixture
def carpeta_cargas(tmp_path, monkeypatch):
    """Las pruebas nunca escriben en la carpeta real de cargas (data/uploads)."""
    monkeypatch.setattr(imagen_service, "UPLOAD_DIR", tmp_path)
    return tmp_path


def test_subir_imagen_de_evento(client, datos_base, headers_admin, headers_usuario, carpeta_cargas):
    r = client.post(f"{API}/uploads/imagenes", headers=headers_admin, files={"archivo": ("foto.png", PNG, "image/png")})
    assert r.status_code == 201, r.text
    url = r.json()["url"]
    assert (carpeta_cargas / url.rsplit("/", 1)[1]).exists()
    r = client.put(f"{API}/servicios/{datos_base['servicio_id']}", headers=headers_admin, json={"imagen_url": url})
    assert r.status_code == 200 and r.json()["imagen_url"] == url

    # Formato, contenido y permisos.
    assert client.post(f"{API}/uploads/imagenes", headers=headers_admin,
                       files={"archivo": ("x.png", b"no soy una imagen", "image/png")}).status_code == 400
    assert client.post(f"{API}/uploads/imagenes", headers=headers_admin,
                       files={"archivo": ("x.svg", b"<svg/>", "image/svg+xml")}).status_code == 400
    assert client.post(f"{API}/uploads/imagenes", headers=headers_usuario,
                       files={"archivo": ("foto.png", PNG, "image/png")}).status_code in (401, 403)
    # URL web válida, inválida y quitar la imagen.
    r = client.put(f"{API}/servicios/{datos_base['servicio_id']}", headers=headers_admin,
                   json={"imagen_url": "javascript:alert(1)"})
    assert r.status_code == 422
    r = client.put(f"{API}/servicios/{datos_base['servicio_id']}", headers=headers_admin, json={"imagen_url": ""})
    assert r.status_code == 200 and r.json()["imagen_url"] is None


def test_limpieza_de_imagenes_huerfanas(db, datos_base, carpeta_cargas):
    usada, huerfana, reciente, otra = (carpeta_cargas / n for n in (
        "evento_usada.png", "evento_huerfana.png", "evento_reciente.png", "bienvenida_x.png",
    ))
    for archivo in (usada, huerfana, reciente, otra):
        archivo.write_bytes(PNG)
    viejo = reloj.time() - 3 * 24 * 3600
    for archivo in (usada, huerfana, otra):
        os.utime(archivo, (viejo, viejo))
    db.get(Servicio, datos_base["servicio_id"]).imagen_url = "/api/uploads/evento_usada.png"
    db.commit()

    assert imagen_service.limpiar_imagenes_huerfanas(db) == ["evento_huerfana.png"]
    # La usada por un evento, la recién subida y las que no son de eventos se conservan.
    assert usada.exists() and reciente.exists() and otra.exists() and not huerfana.exists()


# ---- Migración 0012: traslado de la semana activa y de las ventanas de inscripción -------------

def _migracion_0012():
    ruta = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "0012_vigencia_y_regla_por_evento.py"
    spec = importlib.util.spec_from_file_location("migracion_0012", ruta)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


@pytest.mark.parametrize("unico_por_semana,periodo", [("true", "evento"), ("false", "dia")])
def test_migracion_traslada_la_configuracion_global_a_cada_evento(db, datos_base, unico_por_semana, periodo):
    db.add_all([
        ConfiguracionGeneral(clave="semana_activa_inicio", valor="2026-08-17"),
        ConfiguracionGeneral(clave="semana_activa_fin", valor="2026-08-21"),
        ConfiguracionGeneral(clave="evento_unico_por_semana", valor=unico_por_semana),
    ])
    for servicio in db.query(Servicio).all():
        servicio.limite_participaciones = None  # como queda la columna recién agregada
    con_ventana = Actividad(nombre="Con ventana", fecha_apertura_inscripciones=datetime(2026, 11, 1, 10),
                            fecha_cierre_inscripciones=datetime(2026, 11, 25, 18))
    con_sesiones = Actividad(nombre="Con sesiones", created_at=datetime(2026, 11, 20, 9))
    sin_nada = Actividad(nombre="Sin nada", created_at=datetime(2026, 11, 2, 9))
    creada_tarde = Actividad(nombre="Creada tarde", created_at=datetime(2026, 12, 1, 9))
    db.add_all([con_ventana, con_sesiones, sin_nada, creada_tarde])
    db.flush()
    for actividad, dia in ((con_sesiones, date(2026, 12, 5)), (con_sesiones, date(2026, 12, 10)), (creada_tarde, date(2026, 11, 28))):
        db.add(Sesion(actividad_id=actividad.id, fecha=dia, hora_inicio=time(8), hora_fin=time(9)))
    db.commit()

    for sentencia in _migracion_0012().SENTENCIAS_DATOS:
        db.execute(text(sentencia))
    db.commit()
    db.expire_all()

    for servicio in db.query(Servicio).all():
        assert (servicio.vigencia_inicio, servicio.vigencia_fin) == (date(2026, 8, 17), date(2026, 8, 21))
        assert (servicio.limite_participaciones, servicio.periodo_limite) == (1, periodo)
    assert (con_ventana.vigencia_inicio, con_ventana.vigencia_fin) == (date(2026, 11, 1), date(2026, 11, 25))
    assert (con_sesiones.vigencia_inicio, con_sesiones.vigencia_fin) == (date(2026, 11, 20), date(2026, 12, 10))
    assert (sin_nada.vigencia_inicio, sin_nada.vigencia_fin) == (date(2026, 11, 2), None)
    assert (creada_tarde.vigencia_inicio, creada_tarde.vigencia_fin) == (date(2026, 11, 28), date(2026, 11, 28))
    assert con_sesiones.limite_participaciones is None and con_sesiones.periodo_limite == "evento"
