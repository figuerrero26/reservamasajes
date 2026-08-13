"""Registro y login de cuentas de colaborador (separado de la autenticación administrativa).

El registro es abierto: no pide ni exige cédula, cualquier persona puede crear una cuenta
con nombre, apellido, correo y contraseña.
"""
from app.models import Usuario


def _registro_payload(**overrides):
    payload = {
        "nombre": "Nueva", "apellido": "Cuenta",
        "correo": "nueva.cuenta@example.com", "password": "Segura123*",
    }
    payload.update(overrides)
    return payload


def test_registro_exitoso_sin_cedula(client, datos_base):
    r = client.post("/api/v1/cuenta/registro", json=_registro_payload())
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["nombre"] == "Nueva"
    assert body["correo"] == "nueva.cuenta@example.com"
    assert "access_token" in body


def test_registro_ignora_campos_extra_no_soportados(client, datos_base):
    """El modelo Usuario ya no tiene cédula/área/cargo: si el cliente los envía de todas
    formas, Pydantic los ignora (extra="ignore" por defecto) sin romper el registro."""
    r = client.post("/api/v1/cuenta/registro", json=_registro_payload(cedula="999999999", area="Planta"))
    assert r.status_code == 201, r.text


def test_registro_crea_usuario_con_solo_los_campos_basicos(client, db, datos_base):
    r = client.post("/api/v1/cuenta/registro", json=_registro_payload())
    assert r.status_code == 201

    usuario = db.query(Usuario).filter_by(correo="nueva.cuenta@example.com").one()
    assert usuario.password_hash is not None
    assert usuario.tiene_cuenta is True


def test_registro_con_correo_en_uso_da_409(client, datos_base):
    # datos_base ya crea al colaborador con correo "colaborador.demo@example.com".
    r = client.post("/api/v1/cuenta/registro", json=_registro_payload(correo="colaborador.demo@example.com"))
    assert r.status_code == 409


def test_login_valido(client, datos_base):
    r = client.post("/api/v1/cuenta/login", json={
        "correo": "colaborador.demo@example.com", "password": "Colaborador123*",
    })
    assert r.status_code == 200
    assert r.json()["correo"] == "colaborador.demo@example.com"


def test_login_invalido(client, datos_base):
    r = client.post("/api/v1/cuenta/login", json={
        "correo": "colaborador.demo@example.com", "password": "clave-incorrecta",
    })
    assert r.status_code == 401


def test_usuario_bloqueado_no_puede_iniciar_sesion(client, db, datos_base):
    usuario = db.query(Usuario).filter_by(correo="colaborador.demo@example.com").one()
    usuario.activo = False
    db.commit()

    r = client.post("/api/v1/cuenta/login", json={
        "correo": "colaborador.demo@example.com", "password": "Colaborador123*",
    })
    assert r.status_code == 401


def test_me_devuelve_el_perfil_propio(client, headers_usuario):
    r = client.get("/api/v1/cuenta/me", headers=headers_usuario)
    assert r.status_code == 200
    assert r.json()["correo"] == "colaborador.demo@example.com"


def test_me_sin_token_da_401(client, datos_base):
    r = client.get("/api/v1/cuenta/me")
    assert r.status_code == 401


def test_token_de_usuario_no_sirve_para_endpoints_de_admin(client, headers_usuario):
    r = client.get("/api/v1/areas", headers=headers_usuario)
    assert r.status_code == 401


def test_token_de_admin_no_sirve_para_endpoints_de_usuario(client, headers_admin):
    r = client.get("/api/v1/reservas/mias", headers=headers_admin)
    assert r.status_code == 401


# ---- Gestión de cuentas desde el panel administrativo ----

def test_admin_bloquea_y_desbloquea_una_cuenta(client, datos_base, headers_admin):
    usuario_id = datos_base["usuario_id"]

    r = client.post(f"/api/v1/usuarios/{usuario_id}/desactivar", headers=headers_admin)
    assert r.status_code == 200
    assert r.json()["activo"] is False

    # Bloqueado: no puede iniciar sesión.
    r = client.post("/api/v1/cuenta/login", json={
        "correo": "colaborador.demo@example.com", "password": "Colaborador123*",
    })
    assert r.status_code == 401

    r = client.post(f"/api/v1/usuarios/{usuario_id}/activar", headers=headers_admin)
    assert r.status_code == 200
    assert r.json()["activo"] is True

    # Desbloqueado: vuelve a poder iniciar sesión.
    r = client.post("/api/v1/cuenta/login", json={
        "correo": "colaborador.demo@example.com", "password": "Colaborador123*",
    })
    assert r.status_code == 200


def test_bloqueo_y_desbloqueo_quedan_en_auditoria(client, datos_base, headers_admin):
    usuario_id = datos_base["usuario_id"]
    client.post(f"/api/v1/usuarios/{usuario_id}/desactivar", headers=headers_admin)
    client.post(f"/api/v1/usuarios/{usuario_id}/activar", headers=headers_admin)

    r = client.get("/api/v1/auditoria", params={"entidad": "usuario"}, headers=headers_admin)
    acciones = [a["accion"] for a in r.json()]
    assert "bloquear_usuario" in acciones
    assert "desbloquear_usuario" in acciones


def test_admin_restablece_password_de_usuario(client, datos_base, headers_admin):
    usuario_id = datos_base["usuario_id"]
    r = client.post(
        f"/api/v1/usuarios/{usuario_id}/resetear-password", headers=headers_admin,
        json={"password_nueva": "OtraClaveSegura123*"},
    )
    assert r.status_code == 200

    # La contraseña anterior ya no sirve.
    r = client.post("/api/v1/cuenta/login", json={
        "correo": "colaborador.demo@example.com", "password": "Colaborador123*",
    })
    assert r.status_code == 401

    # La nueva sí.
    r = client.post("/api/v1/cuenta/login", json={
        "correo": "colaborador.demo@example.com", "password": "OtraClaveSegura123*",
    })
    assert r.status_code == 200


def test_reset_de_password_queda_en_auditoria(client, datos_base, headers_admin):
    usuario_id = datos_base["usuario_id"]
    client.post(
        f"/api/v1/usuarios/{usuario_id}/resetear-password", headers=headers_admin,
        json={"password_nueva": "OtraClaveSegura123*"},
    )
    r = client.get("/api/v1/auditoria", params={"entidad": "usuario"}, headers=headers_admin)
    acciones = [a["accion"] for a in r.json()]
    assert "resetear_password_usuario" in acciones


def test_bloquear_usuario_sin_autenticacion_de_admin_da_401(client, datos_base):
    r = client.post(f"/api/v1/usuarios/{datos_base['usuario_id']}/desactivar")
    assert r.status_code == 401
