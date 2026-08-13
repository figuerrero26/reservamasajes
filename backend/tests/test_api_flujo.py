"""Pruebas de integración de extremo a extremo vía la API HTTP."""
from datetime import date, timedelta


def _lunes_futuro() -> date:
    d = date.today() + timedelta(days=14)
    return d - timedelta(days=d.weekday())


def _crear_usuario_y_headers(client, db, nombre: str, apellido: str,
                              correo: str, password: str = "Colaborador123*") -> dict:
    """Crea una cuenta directamente en BD y devuelve los headers Authorization ya autenticados."""
    from app.auth.security import hash_password
    from app.models import Usuario

    db.add(Usuario(nombre=nombre, apellido=apellido, correo=correo,
                    password_hash=hash_password(password)))
    db.commit()

    r = client.post("/api/v1/cuenta/login", json={"correo": correo, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_flujo_completo_reserva_y_cancelacion(client, db, datos_base, headers_admin, headers_usuario):
    lunes = _lunes_futuro().isoformat()

    r = client.get(f"/api/v1/agendas/{datos_base['agenda_id']}/horarios", params={"fecha": lunes})
    assert r.status_code == 200
    slots = r.json()["slots"]
    disponible = next(s for s in slots if s["estado"] == "disponible")

    # Sin autenticación no se puede reservar.
    r_anon = client.post("/api/v1/reservas", json={
        "agenda_id": datos_base["agenda_id"], "fecha": lunes, "hora_inicio": disponible["hora_inicio"],
    })
    assert r_anon.status_code == 401

    r = client.post("/api/v1/reservas", json={
        "agenda_id": datos_base["agenda_id"], "fecha": lunes, "hora_inicio": disponible["hora_inicio"],
    }, headers=headers_usuario)
    assert r.status_code == 201, r.text
    reserva = r.json()
    assert reserva["estado"] == "activa"
    assert reserva["correo_confirmacion"] == "pendiente"

    # El slot ya no debe figurar como disponible.
    r = client.get(f"/api/v1/agendas/{datos_base['agenda_id']}/horarios", params={"fecha": lunes})
    ocupado = next(s for s in r.json()["slots"] if s["hora_inicio"] == disponible["hora_inicio"])
    assert ocupado["estado"] == "ocupado"

    # Un segundo intento del MISMO evento el MISMO día debe fallar.
    r2 = client.post("/api/v1/reservas", json={
        "agenda_id": datos_base["agenda_id"], "fecha": lunes, "hora_inicio": disponible["hora_inicio"],
    }, headers=headers_usuario)
    assert r2.status_code == 409
    assert "evento" in r2.json()["detail"].lower()

    # Pero SÍ puede reservar un evento distinto el mismo día.
    r_otro = client.get(f"/api/v1/agendas/{datos_base['agenda2_id']}/horarios", params={"fecha": lunes})
    disponible_otro = next(s for s in r_otro.json()["slots"] if s["estado"] == "disponible")
    r3 = client.post("/api/v1/reservas", json={
        "agenda_id": datos_base["agenda2_id"], "fecha": lunes, "hora_inicio": disponible_otro["hora_inicio"],
    }, headers=headers_usuario)
    assert r3.status_code == 201, r3.text

    # "Mis reservas" trae ambas, solo las propias.
    r = client.get("/api/v1/reservas/mias", headers=headers_usuario)
    assert r.status_code == 200
    assert {x["id"] for x in r.json()} == {reserva["id"], r3.json()["id"]}

    # El propio usuario cancela la primera.
    r = client.post(f"/api/v1/reservas/{reserva['id']}/cancelar", headers=headers_usuario)
    assert r.status_code == 200
    assert r.json()["estado"] == "cancelada"

    # El slot vuelve a estar disponible.
    r = client.get(f"/api/v1/agendas/{datos_base['agenda_id']}/horarios", params={"fecha": lunes})
    libre = next(s for s in r.json()["slots"] if s["hora_inicio"] == disponible["hora_inicio"])
    assert libre["estado"] == "disponible"


def test_no_se_puede_cancelar_reserva_de_otro_usuario(client, db, datos_base, headers_usuario):
    lunes = _lunes_futuro().isoformat()
    r = client.get(f"/api/v1/agendas/{datos_base['agenda_id']}/horarios", params={"fecha": lunes})
    disponible = next(s for s in r.json()["slots"] if s["estado"] == "disponible")
    r = client.post("/api/v1/reservas", json={
        "agenda_id": datos_base["agenda_id"], "fecha": lunes, "hora_inicio": disponible["hora_inicio"],
    }, headers=headers_usuario)
    reserva_id = r.json()["id"]

    headers_otro = _crear_usuario_y_headers(client, db, "Otra", "Persona", "otra.persona@example.com")
    r = client.post(f"/api/v1/reservas/{reserva_id}/cancelar", headers=headers_otro)
    assert r.status_code == 403


def test_slot_ocupado_por_otro_da_409(client, db, datos_base, headers_usuario):
    lunes = _lunes_futuro().isoformat()
    r = client.get(f"/api/v1/agendas/{datos_base['agenda_id']}/horarios", params={"fecha": lunes})
    disponible = next(s for s in r.json()["slots"] if s["estado"] == "disponible")

    r1 = client.post("/api/v1/reservas", json={
        "agenda_id": datos_base["agenda_id"], "fecha": lunes, "hora_inicio": disponible["hora_inicio"],
    }, headers=headers_usuario)
    assert r1.status_code == 201

    headers_otro = _crear_usuario_y_headers(client, db, "Otro", "Colaborador", "otro.colaborador@example.com")
    r2 = client.post("/api/v1/reservas", json={
        "agenda_id": datos_base["agenda_id"], "fecha": lunes, "hora_inicio": disponible["hora_inicio"],
    }, headers=headers_otro)
    assert r2.status_code == 409
    assert "disponible" in r2.json()["detail"].lower()


def test_reserva_manual_por_admin_identifica_por_correo(client, datos_base, headers_admin):
    lunes = _lunes_futuro().isoformat()
    r = client.get(f"/api/v1/agendas/{datos_base['agenda_id']}/horarios", params={"fecha": lunes})
    disponible = next(s for s in r.json()["slots"] if s["estado"] == "disponible")

    r = client.post("/api/v1/reservas/manual", headers=headers_admin, json={
        "correo": "colaborador.demo@example.com", "agenda_id": datos_base["agenda_id"],
        "fecha": lunes, "hora_inicio": disponible["hora_inicio"], "notes": "Reservado por soporte",
    })
    assert r.status_code == 201, r.text
    assert r.json()["notes"] == "Reservado por soporte"


def test_reserva_manual_con_correo_inexistente_da_404(client, datos_base, headers_admin):
    lunes = _lunes_futuro().isoformat()
    r = client.post("/api/v1/reservas/manual", headers=headers_admin, json={
        "correo": "no.existe@example.com", "agenda_id": datos_base["agenda_id"],
        "fecha": lunes, "hora_inicio": "09:00:00",
    })
    assert r.status_code == 404


def test_reinicio_semana_no_borra_filas(client, db, datos_base, headers_admin, headers_usuario):
    lunes = _lunes_futuro()
    r = client.get(f"/api/v1/agendas/{datos_base['agenda_id']}/horarios", params={"fecha": lunes.isoformat()})
    disponible = next(s for s in r.json()["slots"] if s["estado"] == "disponible")
    r = client.post("/api/v1/reservas", json={
        "agenda_id": datos_base["agenda_id"], "fecha": lunes.isoformat(), "hora_inicio": disponible["hora_inicio"],
    }, headers=headers_usuario)
    reserva_id = r.json()["id"]

    r = client.post("/api/v1/semana/reiniciar", params={"fecha_lunes": lunes.isoformat()},
                     headers=headers_admin)
    assert r.status_code == 200
    assert r.json()["reservas_afectadas"] == 1

    r = client.get("/api/v1/reservas", params={"agenda_id": datos_base["agenda_id"]}, headers=headers_admin)
    ids = [x["id"] for x in r.json()]
    assert reserva_id in ids  # sigue existiendo, solo cambió de estado
    afectada = next(x for x in r.json() if x["id"] == reserva_id)
    assert afectada["estado"] == "cancelada"


def test_auditoria_registra_login(client, datos_base, headers_admin):
    r = client.get("/api/v1/auditoria", headers=headers_admin)
    assert r.status_code == 200
    acciones = [a["accion"] for a in r.json()]
    assert "login" in acciones


def test_admin_busca_reservas_por_nombre_y_correo(client, datos_base, headers_admin, headers_usuario):
    lunes = _lunes_futuro().isoformat()
    r = client.get(f"/api/v1/agendas/{datos_base['agenda_id']}/horarios", params={"fecha": lunes})
    disponible = next(s for s in r.json()["slots"] if s["estado"] == "disponible")
    client.post("/api/v1/reservas", json={
        "agenda_id": datos_base["agenda_id"], "fecha": lunes, "hora_inicio": disponible["hora_inicio"],
    }, headers=headers_usuario)

    r = client.get("/api/v1/reservas", params={"nombre": "Colaborador"}, headers=headers_admin)
    assert len(r.json()) == 1

    r = client.get("/api/v1/reservas", params={"correo": "colaborador.demo@example.com"}, headers=headers_admin)
    assert len(r.json()) == 1

    r = client.get("/api/v1/reservas", params={"nombre": "NoExiste"}, headers=headers_admin)
    assert r.json() == []
