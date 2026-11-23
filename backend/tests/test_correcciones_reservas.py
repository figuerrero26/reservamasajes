"""Integración (MariaDB real): correcciones del diagnóstico en el módulo de reservas.

Cada bloque reproduce un problema concreto y verifica su solución:
1. Agendas cerca de la medianoche: la API responde (no se cuelga) y genera turnos correctos.
2. Modificar una agenda con reservas futuras no puede dejarlas inconsistentes.
3. Bloqueos y festivos informan las reservas afectadas sin cancelarlas, impiden nuevas
   reservas y la cancelación posterior es explícita y notificada.
4. Desactivar un evento/área corta las reservas desde el backend y se puede reactivar.
5. Sesiones revocables, cancelación retroactiva, reinicio semanal y validaciones.
"""
from datetime import date, time, timedelta

from app.database.session import SessionLocal
from app.models import Administrador, Agenda, EstadoReserva, Notificacion, Reserva, Usuario
from app.services.reserva_service import ReservaService

API = "/api/v1"


def _lunes_futuro() -> date:
    d = date.today() + timedelta(days=14)
    return d - timedelta(days=d.weekday())


def _reservar(datos_base, hora=time(9, 0), fecha=None, agenda_key="agenda_id") -> Reserva:
    db = SessionLocal()
    try:
        return ReservaService(db).crear(
            agenda_id=datos_base[agenda_key], fecha=fecha or _lunes_futuro(), hora_inicio=hora,
            usuario_id=datos_base["usuario_id"],
        )
    finally:
        db.close()


def _estado_reserva(reserva_id: int) -> str:
    db = SessionLocal()
    try:
        return db.get(Reserva, reserva_id).estado
    finally:
        db.close()


# ---- 1. Medianoche -----------------------------------------------------------------------

def test_agenda_nocturna_genera_turnos_sin_colgarse(client, datos_base, headers_admin):
    r = client.post(f"{API}/agendas", headers=headers_admin, json={
        "nombre": "Nocturna", "area_id": datos_base["area_id"], "servicio_id": datos_base["servicio2_id"],
        "hora_inicio": "20:00", "hora_fin": "23:45", "duracion_minutos": 30, "dias_habilitados": "0,1,2,3,4,5,6",
    })
    # Ya existe una agenda para servicio2 en esa área: se usa otra área.
    if r.status_code == 409:
        area = client.post(f"{API}/areas", headers=headers_admin, json={"nombre": "Planta"}).json()
        r = client.post(f"{API}/agendas", headers=headers_admin, json={
            "nombre": "Nocturna", "area_id": area["id"], "servicio_id": datos_base["servicio2_id"],
            "hora_inicio": "20:00", "hora_fin": "23:45", "duracion_minutos": 30, "dias_habilitados": "0,1,2,3,4,5,6",
        })
    assert r.status_code == 201, r.text
    slots = client.get(f"{API}/agendas/{r.json()['id']}/horarios", params={"fecha": _lunes_futuro().isoformat()}).json()["slots"]
    assert [s["hora_inicio"][:5] for s in slots] == ["20:00", "20:30", "21:00", "21:30", "22:00", "22:30", "23:00"]


def test_no_se_puede_guardar_duracion_cero(client, datos_base, headers_admin):
    r = client.put(f"{API}/agendas/{datos_base['agenda_id']}", headers=headers_admin, json={"duracion_minutos": 0})
    assert r.status_code == 422


def test_dias_habilitados_invalidos_se_rechazan(client, datos_base, headers_admin):
    r = client.put(f"{API}/agendas/{datos_base['agenda_id']}", headers=headers_admin, json={"dias_habilitados": "a,b"})
    assert r.status_code == 422


# ---- 2. Agenda con reservas existentes -------------------------------------------------------

def test_cambio_de_duracion_incompatible_con_reservas_futuras_se_rechaza(client, datos_base, headers_admin):
    reserva = _reservar(datos_base, hora=time(8, 30))
    r = client.put(f"{API}/agendas/{datos_base['agenda_id']}", headers=headers_admin, json={"duracion_minutos": 45})
    assert r.status_code == 409
    cuerpo = r.json()
    assert [x["id"] for x in cuerpo["reservas_afectadas"]] == [reserva.id]
    # Nada cambió: ni la agenda ni la reserva.
    agenda = client.get(f"{API}/agendas", headers=headers_admin).json()
    assert next(a for a in agenda if a["id"] == datos_base["agenda_id"])["duracion_minutos"] == 30
    assert _estado_reserva(reserva.id) == EstadoReserva.ACTIVA.value


def test_deshabilitar_dia_con_reserva_se_rechaza(client, datos_base, headers_admin):
    _reservar(datos_base)  # lunes
    r = client.put(f"{API}/agendas/{datos_base['agenda_id']}", headers=headers_admin,
                   json={"dias_habilitados": "1,2,3,4"})
    assert r.status_code == 409


def test_cambio_compatible_con_reservas_se_aplica(client, datos_base, headers_admin):
    _reservar(datos_base, hora=time(9, 0))
    # Extender el horario conserva el turno 09:00-09:30: se permite.
    r = client.put(f"{API}/agendas/{datos_base['agenda_id']}", headers=headers_admin,
                   json={"hora_fin": "18:00", "nombre": "Masajes extendido"})
    assert r.status_code == 200, r.text
    assert r.json()["hora_fin"].startswith("18:00")


def test_cambiar_evento_de_agenda_con_reservas_se_rechaza(client, datos_base, headers_admin):
    _reservar(datos_base)
    # El evento nuevo nace en otra área: así el cambio de evento de la agenda de "Oficinas"
    # no choca con la unicidad área+evento y llega a la validación de reservas.
    planta = client.post(f"{API}/areas", headers=headers_admin, json={"nombre": "Planta"}).json()
    servicio = client.post(f"{API}/servicios", headers=headers_admin, json={
        "nombre": "Yoga",
        "agenda": {"area_id": planta["id"], "hora_inicio": "08:00", "hora_fin": "12:00", "duracion_minutos": 60},
    }).json()
    r = client.put(f"{API}/agendas/{datos_base['agenda_id']}", headers=headers_admin,
                   json={"servicio_id": servicio["id"]})
    assert r.status_code == 409


def test_reserva_fuera_de_grilla_bloquea_turnos_solapados(client, datos_base, headers_usuario, db):
    """Datos históricos (anteriores a la validación): una reserva 08:30-09:00 en una grilla
    de 45 min no puede permitir reservar el turno 08:00-08:45 que se cruza con ella."""
    _reservar(datos_base, hora=time(8, 30))
    agenda = db.get(Agenda, datos_base["agenda_id"])
    agenda.duracion_minutos = 45  # cambio directo en BD, como si fuera un dato antiguo
    db.commit()
    fecha = _lunes_futuro().isoformat()
    slots = client.get(f"{API}/agendas/{datos_base['agenda_id']}/horarios", params={"fecha": fecha}).json()["slots"]
    primero = next(s for s in slots if s["hora_inicio"].startswith("08:00"))
    assert primero["estado"] == "ocupado"


# ---- 3. Bloqueos y festivos ------------------------------------------------------------------

def test_bloqueo_informa_reservas_afectadas_sin_cancelarlas(client, datos_base, headers_admin, headers_usuario):
    reserva = _reservar(datos_base, hora=time(9, 0))
    fecha = _lunes_futuro().isoformat()
    r = client.post(f"{API}/bloqueos", headers=headers_admin, json={
        "agenda_id": datos_base["agenda_id"], "tipo": "rango", "fecha": fecha,
        "hora_inicio": "08:45", "hora_fin": "10:00", "motivo": "Mantenimiento",
    })
    assert r.status_code == 201, r.text
    assert [x["id"] for x in r.json()["reservas_afectadas"]] == [reserva.id]
    assert _estado_reserva(reserva.id) == EstadoReserva.ACTIVA.value  # no se canceló sola

    # No se pueden crear nuevas reservas dentro del bloqueo.
    r = client.post(f"{API}/reservas", headers=headers_usuario, json={
        "agenda_id": datos_base["agenda2_id"], "fecha": fecha, "hora_inicio": "09:15",
    })
    assert r.status_code in (200, 201)  # otra agenda: no la afecta el bloqueo
    slots = client.get(f"{API}/agendas/{datos_base['agenda_id']}/horarios", params={"fecha": fecha}).json()["slots"]
    estados = {s["hora_inicio"][:5]: s["estado"] for s in slots}
    assert estados["09:30"] == "bloqueado" and estados["08:30"] == "bloqueado"  # 08:30-09:00 se cruza
    assert estados["10:00"] == "disponible"
    client.post(f"{API}/cuenta/registro", json={
        "nombre": "Otra", "apellido": "Persona", "correo": "otra@example.com", "password": "Clave1234*",
    })
    r = client.post(f"{API}/reservas/manual", headers=headers_admin, json={
        "correo": "otra@example.com", "agenda_id": datos_base["agenda_id"], "fecha": fecha, "hora_inicio": "09:30",
    })
    assert r.status_code == 409 and "no está disponible" in r.json()["detail"]

    # La vista por día sigue mostrando la reserva dentro del rango bloqueado.
    dia = client.get(f"{API}/reservas/dia", headers=headers_admin, params={"fecha": fecha}).json()
    agenda = next(a for a in dia if a["agenda_id"] == datos_base["agenda_id"])
    assert any(s["reserva_id"] == reserva.id for s in agenda["slots"])


def test_festivo_informa_y_la_vista_por_dia_no_oculta_reservas(client, datos_base, headers_admin):
    reserva = _reservar(datos_base)
    fecha = _lunes_futuro().isoformat()
    r = client.post(f"{API}/festivos", headers=headers_admin, json={"fecha": fecha, "nombre": "Festivo"})
    assert r.status_code == 201, r.text
    assert [x["id"] for x in r.json()["reservas_afectadas"]] == [reserva.id]

    # Sin turnos nuevos para el público…
    slots = client.get(f"{API}/agendas/{datos_base['agenda_id']}/horarios", params={"fecha": fecha}).json()["slots"]
    assert slots == []
    # …pero el administrador ve el día bloqueado con la reserva adentro.
    dia = client.get(f"{API}/reservas/dia", headers=headers_admin, params={"fecha": fecha}).json()
    agenda = next(a for a in dia if a["agenda_id"] == datos_base["agenda_id"])
    turno = next(s for s in agenda["slots"] if s["reserva_id"] == reserva.id)
    assert turno["estado"] == "bloqueado"


def test_cancelar_lote_confirmado_cancela_y_notifica(client, datos_base, headers_admin):
    r1 = _reservar(datos_base, hora=time(9, 0))
    r2 = _reservar(datos_base, hora=time(9, 0), agenda_key="agenda2_id")
    r = client.post(f"{API}/reservas/cancelar-lote", headers=headers_admin, json={
        "reserva_ids": [r1.id, r2.id, 999999], "motivo": "Festivo", "notificar": True,
    })
    assert r.status_code == 200, r.text
    assert sorted(r.json()["canceladas"]) == sorted([r1.id, r2.id])
    assert r.json()["omitidas"] == [999999]
    assert _estado_reserva(r1.id) == EstadoReserva.CANCELADA.value

    db = SessionLocal()
    try:
        notifs = db.query(Notificacion).filter(Notificacion.tipo == "cancelacion").all()
        assert sorted(n.reserva_id for n in notifs) == sorted([r1.id, r2.id])
    finally:
        db.close()


# ---- 4. Desactivar evento / área -------------------------------------------------------------

def test_desactivar_evento_corta_reservas_en_backend_y_reactivar_restaura(client, datos_base, headers_admin, headers_usuario):
    reserva = _reservar(datos_base)
    fecha = _lunes_futuro().isoformat()

    r = client.post(f"{API}/servicios/{datos_base['servicio_id']}/desactivar", headers=headers_admin)
    assert r.status_code == 200
    assert [x["id"] for x in r.json()["reservas_afectadas"]] == [reserva.id]
    assert _estado_reserva(reserva.id) == EstadoReserva.ACTIVA.value  # se conserva

    ids_eventos = [e["id"] for e in client.get(f"{API}/eventos").json()]
    assert datos_base["servicio_id"] not in ids_eventos
    assert client.get(f"{API}/agendas/publicas", params={"servicio_id": datos_base["servicio_id"]}).json() == []
    assert client.get(f"{API}/agendas/{datos_base['agenda_id']}/horarios", params={"fecha": fecha}).status_code == 404
    r = client.post(f"{API}/reservas", headers=headers_usuario, json={
        "agenda_id": datos_base["agenda_id"], "fecha": (_lunes_futuro() + timedelta(days=1)).isoformat(),
        "hora_inicio": "10:00",
    })
    assert r.status_code == 400  # ni siquiera por API directa

    r = client.post(f"{API}/servicios/{datos_base['servicio_id']}/activar", headers=headers_admin)
    assert r.status_code == 200
    assert datos_base["servicio_id"] in [e["id"] for e in client.get(f"{API}/eventos").json()]


def test_desactivar_area_saca_sus_agendas_del_portal(client, datos_base, headers_admin):
    r = client.post(f"{API}/areas/{datos_base['area_id']}/desactivar", headers=headers_admin)
    assert r.status_code == 200
    assert client.get(f"{API}/eventos").json() == []
    client.post(f"{API}/areas/{datos_base['area_id']}/activar", headers=headers_admin)
    assert len(client.get(f"{API}/eventos").json()) == 2


def test_editar_servicio_con_nombre_duplicado_da_409(client, datos_base, headers_admin):
    r = client.put(f"{API}/servicios/{datos_base['servicio2_id']}", headers=headers_admin,
                   json={"nombre": "Masaje de relajación"})
    assert r.status_code == 409


# ---- 5. Sesiones, cancelaciones y validaciones ------------------------------------------------

def test_admin_bloqueado_pierde_acceso_de_inmediato(client, datos_base, headers_admin):
    assert client.get(f"{API}/servicios", headers=headers_admin).status_code == 200
    db = SessionLocal()
    try:
        db.get(Administrador, datos_base["admin_id"]).activo = False
        db.commit()
    finally:
        db.close()
    assert client.get(f"{API}/servicios", headers=headers_admin).status_code == 401


def test_cambio_de_rol_aplica_sin_esperar_a_que_expire_el_token(client, datos_base, headers_admin):
    db = SessionLocal()
    try:
        db.get(Administrador, datos_base["admin_id"]).rol_id = datos_base["rol_visor_id"]
        db.commit()
    finally:
        db.close()
    assert client.get(f"{API}/reservas", headers=headers_admin).status_code == 200  # lectura: sí
    assert client.get(f"{API}/administradores", headers=headers_admin).status_code == 403


def test_usuario_bloqueado_pierde_acceso_de_inmediato(client, datos_base, headers_usuario):
    assert client.get(f"{API}/reservas/mias", headers=headers_usuario).status_code == 200
    db = SessionLocal()
    try:
        db.get(Usuario, datos_base["usuario_id"]).activo = False
        db.commit()
    finally:
        db.close()
    assert client.get(f"{API}/reservas/mias", headers=headers_usuario).status_code == 401


def test_no_se_puede_cancelar_una_reserva_que_ya_ocurrio(client, datos_base, headers_usuario, db):
    reserva = _reservar(datos_base)
    fila = db.get(Reserva, reserva.id)
    fila.fecha = date.today() - timedelta(days=1)  # simula que ya pasó
    db.commit()
    r = client.post(f"{API}/reservas/{reserva.id}/cancelar", headers=headers_usuario)
    assert r.status_code == 400
    assert _estado_reserva(reserva.id) == EstadoReserva.ACTIVA.value


def test_mis_reservas_trae_nombre_del_evento_aunque_este_desactivado(client, datos_base, headers_admin, headers_usuario):
    _reservar(datos_base)
    client.post(f"{API}/servicios/{datos_base['servicio_id']}/desactivar", headers=headers_admin)
    mias = client.get(f"{API}/reservas/mias", headers=headers_usuario).json()
    assert mias[0]["evento_nombre"] == "Masaje de relajación"
    assert mias[0]["puede_cancelar"] is True


def test_reinicio_semanal_exige_lunes(client, datos_base, headers_admin):
    martes = _lunes_futuro() + timedelta(days=1)
    r = client.post(f"{API}/semana/reiniciar", params={"fecha_lunes": martes.isoformat()}, headers=headers_admin)
    assert r.status_code == 400


def test_configuracion_invalida_se_rechaza_por_api(client, datos_base, headers_admin):
    r = client.put(f"{API}/configuracion", headers=headers_admin,
                   json={"clave": "cancelacion_horas_minimas", "valor": "dos"})
    assert r.status_code == 400
    r = client.put(f"{API}/configuracion", headers=headers_admin,
                   json={"clave": "contacto_correo", "valor": "bienestar@empresa.com"})
    assert r.status_code == 204
    assert client.get(f"{API}/configuracion").json()["contacto_correo"] == "bienestar@empresa.com"
