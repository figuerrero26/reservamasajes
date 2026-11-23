"""Integración (MariaDB real): áreas como eje de eventos, agendas y actividades.

Verifica que el área sea obligatoria y quede registrada (evento por turnos a través de su
agenda; actividad con su propia columna), los filtros por área, que un área inactiva retire
sus agendas y actividades del portal, la creación atómica (evento + agenda, actividad +
sesiones) y el resumen de disponibilidad que muestran las tarjetas del catálogo.
"""
from datetime import date, timedelta

from app.database.session import SessionLocal
from app.models import Actividad, Agenda, Servicio

API = "/api/v1"


def _lunes_futuro() -> date:
    d = date.today() + timedelta(days=14)
    return d - timedelta(days=d.weekday())


def _horario(area_id: int, **extra) -> dict:
    return {"area_id": area_id, "hora_inicio": "08:00", "hora_fin": "12:00", "duracion_minutos": 30, **extra}


def _contar(modelo) -> int:
    db = SessionLocal()
    try:
        return db.query(modelo).count()
    finally:
        db.close()


# ---- Eventos por turnos: el área nace con el evento ----------------------------------------

def test_evento_por_turnos_exige_area_y_horario(client, datos_base, headers_admin):
    r = client.post(f"{API}/servicios", headers=headers_admin, json={"nombre": "Yoga"})
    assert r.status_code == 422
    antes = _contar(Servicio)
    r = client.post(f"{API}/servicios", headers=headers_admin, json={"nombre": "Yoga", "agenda": _horario(999999)})
    assert r.status_code == 400
    assert _contar(Servicio) == antes  # nada a medias: ni evento sin área ni agenda suelta


def test_crear_evento_crea_tambien_su_agenda_en_el_area(client, datos_base, headers_admin):
    r = client.post(f"{API}/servicios", headers=headers_admin, json={
        "nombre": "Yoga", "descripcion_corta": "Estiramiento guiado", "agenda": _horario(datos_base["area_id"]),
    })
    assert r.status_code == 201, r.text
    servicio_id = r.json()["id"]
    agendas = client.get(f"{API}/agendas", headers=headers_admin, params={"servicio_id": servicio_id}).json()
    assert len(agendas) == 1
    assert agendas[0]["area_id"] == datos_base["area_id"] and agendas[0]["nombre"] == "Yoga - Oficinas"
    # Queda publicado de inmediato con su área.
    evento = next(e for e in client.get(f"{API}/eventos").json() if e["id"] == servicio_id)
    assert evento["areas"] == ["Oficinas"] and evento["area_ids"] == [datos_base["area_id"]]


def test_area_inactiva_no_permite_crear_eventos(client, datos_base, headers_admin):
    client.post(f"{API}/areas/{datos_base['area_id']}/desactivar", headers=headers_admin)
    r = client.post(f"{API}/servicios", headers=headers_admin, json={"nombre": "Yoga", "agenda": _horario(datos_base["area_id"])})
    assert r.status_code == 400


def test_filtros_por_area(client, datos_base, headers_admin):
    planta = client.post(f"{API}/areas", headers=headers_admin, json={"nombre": "Planta"}).json()
    client.post(f"{API}/servicios", headers=headers_admin, json={"nombre": "Pausa activa", "agenda": _horario(planta["id"])})

    en_planta = client.get(f"{API}/servicios", headers=headers_admin, params={"area_id": planta["id"]}).json()
    assert [s["nombre"] for s in en_planta] == ["Pausa activa"]
    en_oficinas = client.get(f"{API}/servicios", headers=headers_admin, params={"area_id": datos_base["area_id"]}).json()
    assert {s["nombre"] for s in en_oficinas} == {"Masaje de relajación", "Silla de masajes"}
    agendas_planta = client.get(f"{API}/agendas", headers=headers_admin, params={"area_id": planta["id"]}).json()
    assert [a["area_id"] for a in agendas_planta] == [planta["id"]]


# ---- Actividades: área obligatoria y registrada --------------------------------------------

def _actividad(area_id, **extra) -> dict:
    return {"area_id": area_id, "nombre": "Taller de pausas", **extra}


def _sesion(dias: int = 7, hora: str = "15:00") -> dict:
    return {"fecha": (date.today() + timedelta(days=dias)).isoformat(), "hora_inicio": hora, "hora_fin": "16:00", "cupo_maximo": 10}


def test_actividad_exige_area_valida(client, datos_base, headers_admin):
    r = client.post(f"{API}/actividades", headers=headers_admin, json={"nombre": "Sin área"})
    assert r.status_code == 422
    r = client.post(f"{API}/actividades", headers=headers_admin, json=_actividad(999999))
    assert r.status_code == 400
    r = client.post(f"{API}/actividades", headers=headers_admin, json=_actividad(datos_base["area_id"]))
    assert r.status_code == 201
    assert r.json()["area_id"] == datos_base["area_id"] and r.json()["area_nombre"] == "Oficinas"
    # No se puede quitar el área al editar.
    r = client.put(f"{API}/actividades/{r.json()['id']}", headers=headers_admin, json={"area_id": None})
    assert r.status_code == 400


def test_actividad_con_sesiones_iniciales_es_atomica(client, datos_base, headers_admin):
    r = client.post(f"{API}/actividades", headers=headers_admin,
                    json=_actividad(datos_base["area_id"], sesiones=[_sesion(7), _sesion(8)]))
    assert r.status_code == 201, r.text
    assert r.json()["resumen"]["sesiones_futuras"] == 2

    antes = _contar(Actividad)
    # Una sesión en el pasado: no se crea nada (ni la actividad ni la otra sesión).
    r = client.post(f"{API}/actividades", headers=headers_admin,
                    json=_actividad(datos_base["area_id"], nombre="Otra", sesiones=[_sesion(7), _sesion(-1)]))
    assert r.status_code == 400
    assert _contar(Actividad) == antes
    # Sesiones repetidas en la misma solicitud.
    r = client.post(f"{API}/actividades", headers=headers_admin,
                    json=_actividad(datos_base["area_id"], nombre="Otra", sesiones=[_sesion(7), _sesion(7)]))
    assert r.status_code == 400


def test_actividad_de_area_inactiva_sale_del_portal(client, datos_base, headers_admin, headers_usuario):
    act = client.post(f"{API}/actividades", headers=headers_admin,
                      json=_actividad(datos_base["area_id"], sesiones=[_sesion()])).json()
    sesion_id = client.get(f"{API}/actividades/{act['id']}/sesiones", headers=headers_admin).json()[0]["id"]

    r = client.post(f"{API}/areas/{datos_base['area_id']}/desactivar", headers=headers_admin)
    assert r.json()["actividades_afectadas"] == 1
    assert act["id"] not in [a["id"] for a in client.get(f"{API}/actividades/publicas").json()]
    assert client.get(f"{API}/actividades/publicas/{act['id']}").status_code == 404
    assert client.post(f"{API}/inscripciones", headers=headers_usuario, json={"sesion_id": sesion_id}).status_code == 400

    client.post(f"{API}/areas/{datos_base['area_id']}/activar", headers=headers_admin)
    assert act["id"] in [a["id"] for a in client.get(f"{API}/actividades/publicas").json()]
    assert client.post(f"{API}/inscripciones", headers=headers_usuario, json={"sesion_id": sesion_id}).status_code == 201


def test_filtro_de_actividades_por_area(client, datos_base, headers_admin):
    planta = client.post(f"{API}/areas", headers=headers_admin, json={"nombre": "Planta"}).json()
    client.post(f"{API}/actividades", headers=headers_admin, json=_actividad(planta["id"], nombre="Caminata"))
    client.post(f"{API}/actividades", headers=headers_admin, json=_actividad(datos_base["area_id"], nombre="Yoga"))
    nombres = [a["nombre"] for a in client.get(f"{API}/actividades", headers=headers_admin, params={"area_id": planta["id"]}).json()]
    assert nombres == ["Caminata"]


def test_actividad_antigua_sin_area_debe_asignarla_para_publicarse(client, datos_base, headers_admin, db):
    act = client.post(f"{API}/actividades", headers=headers_admin, json=_actividad(datos_base["area_id"])).json()
    client.post(f"{API}/actividades/{act['id']}/desactivar", headers=headers_admin)
    fila = db.get(Actividad, act["id"])
    fila.area_id = None  # como las actividades creadas antes de la migración 0011
    db.commit()
    assert client.post(f"{API}/actividades/{act['id']}/activar", headers=headers_admin).status_code == 400
    client.put(f"{API}/actividades/{act['id']}", headers=headers_admin, json={"area_id": datos_base["area_id"]})
    assert client.post(f"{API}/actividades/{act['id']}/activar", headers=headers_admin).status_code == 200


# ---- Disponibilidad en las tarjetas del catálogo -------------------------------------------

def test_resumen_de_turnos_disponibles_en_el_catalogo(client, datos_base, headers_admin, headers_usuario):
    lunes = _lunes_futuro()
    client.put(f"{API}/semana/activa", headers=headers_admin,
               json={"inicio": lunes.isoformat(), "fin": (lunes + timedelta(days=4)).isoformat()})
    dias = client.get(f"{API}/semana/dias-reservables").json()
    assert dias == [(lunes + timedelta(days=i)).isoformat() for i in range(5)]

    def evento(servicio_id):
        return next(e for e in client.get(f"{API}/eventos").json() if e["id"] == servicio_id)

    # 08:00-17:00 con almuerzo 12-13: 16 turnos de 30 min por día × 5 días.
    masajes = evento(datos_base["servicio_id"])
    assert masajes["turnos_disponibles"] == 80
    assert masajes["proximo_turno_fecha"] == lunes.isoformat() and masajes["proximo_turno_hora"].startswith("08:00")
    assert evento(datos_base["servicio2_id"])["turnos_disponibles"] == 160  # turnos de 15 min

    r = client.post(f"{API}/reservas", headers=headers_usuario,
                    json={"agenda_id": datos_base["agenda_id"], "fecha": lunes.isoformat(), "hora_inicio": "08:00"})
    assert r.status_code == 201
    masajes = evento(datos_base["servicio_id"])
    assert masajes["turnos_disponibles"] == 79
    assert masajes["proximo_turno_hora"].startswith("08:30")

    # Un bloqueo de día completo descuenta los turnos de ese día.
    client.post(f"{API}/bloqueos", headers=headers_admin,
                json={"agenda_id": datos_base["agenda_id"], "tipo": "dia", "fecha": (lunes + timedelta(days=1)).isoformat()})
    assert evento(datos_base["servicio_id"])["turnos_disponibles"] == 79 - 16


def test_duracion_del_evento_sale_de_sus_agendas(client, datos_base, headers_admin):
    planta = client.post(f"{API}/areas", headers=headers_admin, json={"nombre": "Planta"}).json()
    r = client.post(f"{API}/agendas", headers=headers_admin, json={
        "nombre": "Masajes - Planta", "area_id": planta["id"], "servicio_id": datos_base["servicio_id"],
        "hora_inicio": "08:00", "hora_fin": "12:00", "duracion_minutos": 45, "dias_habilitados": "0,1,2,3,4",
    })
    assert r.status_code == 201, r.text
    evento = next(e for e in client.get(f"{API}/eventos").json() if e["id"] == datos_base["servicio_id"])
    assert (evento["duracion_minutos"], evento["duracion_maxima"]) == (30, 45)
    assert set(evento["areas"]) == {"Oficinas", "Planta"}


def test_politica_de_privacidad_ya_no_es_configurable(client, datos_base, headers_admin):
    r = client.put(f"{API}/configuracion", headers=headers_admin, json={"clave": "politica_privacidad", "valor": "x"})
    assert r.status_code == 400
    assert "politica_privacidad" not in client.get(f"{API}/configuracion").json()


def test_agenda_de_evento_inactivo_no_figura_como_reservable(client, datos_base, headers_admin, db):
    client.post(f"{API}/servicios/{datos_base['servicio_id']}/desactivar", headers=headers_admin)
    agenda = db.get(Agenda, datos_base["agenda_id"])
    assert agenda.activo is True  # el flag propio de la agenda no se toca
    ids = [a["id"] for a in client.get(f"{API}/agendas/publicas").json()]
    assert datos_base["agenda_id"] not in ids and datos_base["agenda2_id"] in ids
