"""Cuarta ronda: tipos de evento estrictos, agendas desde el evento, contraseñas de los
administradores (fortaleza, permisos, auditoría y cierre de sesiones) y firma de la
plataforma.

Las pruebas que usan `client`/`db` son de integración (base de pruebas); las demás son
unitarias puras.
"""
import importlib.util
from datetime import timedelta
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.auth.politica_password import problemas_password
from app.auth.security import create_access_token
from app.database.session import SessionLocal
from app.models import Administrador, Agenda, Auditoria, ConfiguracionGeneral, Servicio
from app.schemas.actividad import ActividadCreate
from app.schemas.servicio import ServicioCreate
from app.schemas.tipo_evento import mensaje_campos_ajenos
from app.utils.time import today

API = "/api/v1"
PASSWORD_FUERTE = "Bienestar#2026x"
OTRA_FUERTE = "Caminata*Norte77"


def _vigencia(dias: int = 30) -> dict:
    return {"vigencia_inicio": today().isoformat(), "vigencia_fin": (today() + timedelta(days=dias)).isoformat()}


def _horario(area_id: int, **extra) -> dict:
    return {"area_id": area_id, "hora_inicio": "08:00", "hora_fin": "12:00", "duracion_minutos": 30, **extra}


def _evento_reserva(area_id: int, **extra) -> dict:
    return {"nombre": "Yoga en sala", **_vigencia(), "agenda": _horario(area_id), **extra}


def _evento_inscripcion(area_id: int, **extra) -> dict:
    return {"nombre": "Caminata ecológica", "area_id": area_id, **_vigencia(), **extra}


def _contar(modelo) -> int:
    db = SessionLocal()
    try:
        return db.query(modelo).count()
    finally:
        db.close()


def _detalle(r) -> str:
    detalle = r.json()["detail"]
    return detalle if isinstance(detalle, str) else " ".join(d["msg"] for d in detalle)


# ---- Tipos de evento: cada uno solo acepta su propia configuración (unitarias) ---------------

def test_mensaje_de_campos_ajenos_explica_el_tipo():
    assert "evento de inscripción" in mensaje_campos_ajenos(["cupo_maximo"], "reserva")
    assert "evento de reserva" in mensaje_campos_ajenos(["duracion_minutos"], "inscripcion")
    assert "no reconocido" in mensaje_campos_ajenos(["color"], "reserva")


def test_esquema_de_reserva_rechaza_configuracion_de_inscripcion():
    with pytest.raises(ValidationError, match="evento de inscripción"):
        ServicioCreate(**_evento_reserva(1, cupo_maximo=20))
    with pytest.raises(ValidationError, match="evento de inscripción"):
        ServicioCreate(**_evento_reserva(1, sesiones=[]))
    with pytest.raises(ValidationError, match="guarda un evento de reserva"):
        ServicioCreate(**_evento_reserva(1, tipo="inscripcion"))
    assert ServicioCreate(**_evento_reserva(1, tipo="reserva")).agendas[0].area_id == 1


def test_esquema_de_inscripcion_rechaza_configuracion_de_reserva():
    with pytest.raises(ValidationError, match="evento de reserva"):
        ActividadCreate(**_evento_inscripcion(1, agenda=_horario(1)))
    with pytest.raises(ValidationError, match="evento de reserva"):
        ActividadCreate(**_evento_inscripcion(1, duracion_minutos=30))
    with pytest.raises(ValidationError, match="guarda un evento de inscripción"):
        ActividadCreate(**_evento_inscripcion(1, tipo="reserva"))
    # Sesiones con campos de reserva (turnos) también se rechazan.
    with pytest.raises(ValidationError, match="evento de reserva"):
        ActividadCreate(**_evento_inscripcion(1, sesiones=[{
            "fecha": (today() + timedelta(days=3)).isoformat(), "hora_inicio": "09:00", "hora_fin": "10:00",
            "duracion_minutos": 30,
        }]))


def test_evento_de_reserva_admite_varias_agendas_en_areas_distintas():
    evento = ServicioCreate(**{**_evento_reserva(1), "agenda": None, "agendas": [_horario(1), _horario(2)]})
    assert [a.area_id for a in evento.agendas] == [1, 2]
    with pytest.raises(ValidationError, match="área distinta"):
        ServicioCreate(**{**_evento_reserva(1), "agenda": None, "agendas": [_horario(1), _horario(1)]})
    with pytest.raises(ValidationError, match="al menos una agenda"):
        ServicioCreate(**{**_evento_reserva(1), "agenda": None})
    with pytest.raises(ValidationError, match="no en ambos"):
        ServicioCreate(**_evento_reserva(1, agendas=[_horario(2)]))


# ---- Tipos de evento: la API no guarda configuraciones incompatibles (integración) -----------

def test_api_rechaza_configuraciones_incompatibles_sin_guardar_nada(client, datos_base, headers_admin):
    area = datos_base["area_id"]
    servicios_antes, agendas_antes = _contar(Servicio), _contar(Agenda)

    r = client.post(f"{API}/servicios", headers=headers_admin, json=_evento_reserva(area, cupo_maximo=10))
    assert r.status_code == 422 and "evento de inscripción" in _detalle(r)
    r = client.post(f"{API}/servicios", headers=headers_admin, json=_evento_reserva(area, tipo="inscripcion"))
    assert r.status_code == 422
    r = client.post(f"{API}/actividades", headers=headers_admin, json=_evento_inscripcion(area, agenda=_horario(area)))
    assert r.status_code == 422 and "evento de reserva" in _detalle(r)
    r = client.post(f"{API}/actividades", headers=headers_admin,
                    json=_evento_inscripcion(area, dias_habilitados="0,1,2"))
    assert r.status_code == 422
    assert (_contar(Servicio), _contar(Agenda)) == (servicios_antes, agendas_antes)

    # Edición: tampoco se aceptan campos del otro tipo, y el evento queda como estaba.
    r = client.put(f"{API}/servicios/{datos_base['servicio_id']}", headers=headers_admin,
                   json={"nombre": "Otro nombre", "campos_formulario": []})
    assert r.status_code == 422
    servicio = next(s for s in client.get(f"{API}/servicios", headers=headers_admin).json()
                    if s["id"] == datos_base["servicio_id"])
    assert servicio["nombre"] == "Masaje de relajación"

    r = client.post(f"{API}/actividades", headers=headers_admin, json=_evento_inscripcion(area, tipo="inscripcion"))
    assert r.status_code == 201, r.text
    actividad_id = r.json()["id"]
    r = client.put(f"{API}/actividades/{actividad_id}", headers=headers_admin, json={"duracion_minutos": 45})
    assert r.status_code == 422 and "evento de reserva" in _detalle(r)
    r = client.post(f"{API}/actividades/{actividad_id}/sesiones", headers=headers_admin, json={
        "fecha": (today() + timedelta(days=2)).isoformat(), "hora_inicio": "09:00", "hora_fin": "10:00",
        "dias_habilitados": "0,1",
    })
    assert r.status_code == 422
    r = client.post(f"{API}/agendas", headers=headers_admin, json={
        "nombre": "Agenda", "servicio_id": datos_base["servicio_id"], **_horario(area), "cupo_maximo": 5,
    })
    assert r.status_code == 422 and "evento de inscripción" in _detalle(r)


def test_crear_evento_de_reserva_con_varias_agendas(client, datos_base, headers_admin):
    planta = client.post(f"{API}/areas", headers=headers_admin, json={"nombre": "Planta"}).json()
    r = client.post(f"{API}/servicios", headers=headers_admin, json={
        "tipo": "reserva", "nombre": "Pausa activa", **_vigencia(),
        "agendas": [
            _horario(datos_base["area_id"], nombre="Sala 1 · Fisioterapeuta"),
            _horario(planta["id"], duracion_minutos=20, dias_habilitados="0,2,4"),
        ],
    })
    assert r.status_code == 201, r.text
    evento = r.json()
    assert evento["duracion_minutos"] == 20  # la menor duración entre sus agendas
    agendas = client.get(f"{API}/agendas", headers=headers_admin, params={"servicio_id": evento["id"]}).json()
    assert sorted((a["area_id"], a["duracion_minutos"]) for a in agendas) == sorted(
        [(datos_base["area_id"], 30), (planta["id"], 20)])
    assert any(a["nombre"] == "Sala 1 · Fisioterapeuta" for a in agendas)
    assert any(a["nombre"] == "Pausa activa - Planta" for a in agendas)

    # Un área inexistente en cualquiera de las agendas cancela todo (nada a medias).
    antes = (_contar(Servicio), _contar(Agenda))
    r = client.post(f"{API}/servicios", headers=headers_admin, json={
        "nombre": "Otro evento", **_vigencia(), "agendas": [_horario(datos_base["area_id"]), _horario(999999)],
    })
    assert r.status_code == 400
    assert (_contar(Servicio), _contar(Agenda)) == antes

    # El portal ve el lugar y el horario de atención de cada agenda.
    publicas = client.get(f"{API}/agendas/publicas", params={"servicio_id": evento["id"]}).json()
    assert {a["area_nombre"] for a in publicas} == {"Oficinas", "Planta"}
    assert all(a["hora_inicio"] and a["dias_habilitados"] for a in publicas)


def test_editar_evento_no_pierde_agendas_ni_reglas(client, datos_base, headers_admin):
    sid = datos_base["servicio_id"]
    antes = client.get(f"{API}/agendas", headers=headers_admin, params={"servicio_id": sid}).json()
    r = client.put(f"{API}/servicios/{sid}", headers=headers_admin,
                   json={"tipo": "reserva", "descripcion_corta": "Nueva descripción", **_vigencia(10)})
    assert r.status_code == 200, r.text
    assert r.json()["descripcion_corta"] == "Nueva descripción"
    despues = client.get(f"{API}/agendas", headers=headers_admin, params={"servicio_id": sid}).json()
    assert despues == antes


# ---- Política de contraseñas (unitarias) ------------------------------------------------------

@pytest.mark.parametrize("password,requisito", [
    ("Corta#1a", "al menos 10"),
    ("sinmayusculas#2026", "mayúscula"),
    ("SINMINUSCULAS#2026", "minúscula"),
    ("SinNumeros#Largos", "número"),
    ("SinSimbolos2026x", "símbolo"),
    ("Password123!", "común"),
    (" Bienestar#2026", "espacios"),
    ("Aa1!" + "ñ" * 40, "demasiado larga"),
])
def test_politica_rechaza_contrasenas_debiles(password, requisito):
    assert any(requisito in p for p in problemas_password(password)), problemas_password(password)


def test_politica_rechaza_el_usuario_o_el_nombre_y_acepta_una_fuerte():
    assert any("usuario" in p for p in problemas_password("Mariana#2026x", usuario="mariana@empresa.com"))
    assert any("nombre" in p for p in problemas_password("Gutierrez#2026", nombre="Laura Gutierrez"))
    assert problemas_password(PASSWORD_FUERTE, usuario="admin", nombre="Administrador") == []


# ---- Contraseñas de administradores (integración) ---------------------------------------------

def _login(client, usuario: str, password: str):
    return client.post(f"{API}/auth/login", json={"usuario": usuario, "password": password})


def _crear_admin(client, headers, usuario="coordinador@empresa.com", rol="administrador"):
    r = client.post(f"{API}/administradores", headers=headers, json={
        "usuario": usuario, "nombre": "Coordinación Talento", "password": PASSWORD_FUERTE, "rol": rol,
    })
    assert r.status_code == 201, r.text
    return r.json()


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_alta_de_administrador_exige_contrasena_fuerte(client, datos_base, headers_admin):
    r = client.post(f"{API}/administradores", headers=headers_admin, json={
        "usuario": "debil@empresa.com", "nombre": "Débil", "password": "12345678", "rol": "administrador",
    })
    assert r.status_code == 422 and "no es segura" in _detalle(r)
    creado = _crear_admin(client, headers_admin)
    assert creado["password_actualizada_en"] is not None
    assert "hash_password" not in creado and "password" not in creado


def test_restablecer_contrasena_de_otro_administrador(client, datos_base, headers_admin):
    otro = _crear_admin(client, headers_admin)
    sesion_vieja = _login(client, otro["usuario"], PASSWORD_FUERTE).json()["access_token"]
    assert client.get(f"{API}/servicios", headers=_h(sesion_vieja)).status_code == 200

    url = f"{API}/administradores/{otro['id']}/password"
    r = client.post(url, headers=headers_admin, json={"password_nueva": OTRA_FUERTE, "password_confirmacion": "Otra*Cosa123"})
    assert r.status_code == 422 and "confirmación" in _detalle(r)
    r = client.post(url, headers=headers_admin, json={"password_nueva": "debil", "password_confirmacion": "debil"})
    assert r.status_code == 422 and "no es segura" in _detalle(r)
    r = client.post(url, headers=headers_admin, json={"password_nueva": PASSWORD_FUERTE, "password_confirmacion": PASSWORD_FUERTE})
    assert r.status_code == 422 and "distinta de la actual" in _detalle(r)

    r = client.post(url, headers=headers_admin, json={"password_nueva": OTRA_FUERTE, "password_confirmacion": OTRA_FUERTE})
    assert r.status_code == 200, r.text
    assert "password" not in r.json() and r.json()["password_actualizada_en"]

    # La sesión abierta con la contraseña anterior se cierra; la nueva contraseña funciona.
    assert client.get(f"{API}/servicios", headers=_h(sesion_vieja)).status_code == 401
    assert _login(client, otro["usuario"], PASSWORD_FUERTE).status_code == 401
    assert _login(client, otro["usuario"], OTRA_FUERTE).status_code == 200

    # Auditoría: quién, a quién y cuándo; nunca la contraseña ni su hash.
    db = SessionLocal()
    try:
        registro = db.query(Auditoria).filter_by(accion="restablecer_password_administrador").one()
        assert (registro.admin_id, registro.entidad_id) == (datos_base["admin_id"], otro["id"])
        rastro = f"{registro.datos_anteriores} {registro.datos_nuevos}"
        assert OTRA_FUERTE not in rastro and "$2b$" not in rastro
    finally:
        db.close()


def test_la_contrasena_propia_solo_se_cambia_con_la_actual(client, datos_base, headers_admin):
    r = client.post(f"{API}/administradores/{datos_base['admin_id']}/password", headers=headers_admin,
                    json={"password_nueva": OTRA_FUERTE, "password_confirmacion": OTRA_FUERTE})
    assert r.status_code == 409 and "contraseña actual" in _detalle(r)
    r = client.post(f"{API}/auth/resetear-password", headers=headers_admin,
                    json={"usuario": "admin", "password_nueva": OTRA_FUERTE})
    assert r.status_code == 409

    r = client.post(f"{API}/auth/cambiar-password", headers=headers_admin,
                    json={"password_actual": "incorrecta", "password_nueva": OTRA_FUERTE})
    assert r.status_code == 401
    r = client.post(f"{API}/auth/cambiar-password", headers=headers_admin,
                    json={"password_actual": "Admin123*", "password_nueva": "Admin1234*"})
    assert r.status_code == 422  # contiene el usuario "admin"
    r = client.post(f"{API}/auth/cambiar-password", headers=headers_admin,
                    json={"password_actual": "Admin123*", "password_nueva": OTRA_FUERTE, "password_confirmacion": "x"})
    assert r.status_code == 422

    r = client.post(f"{API}/auth/cambiar-password", headers=headers_admin,
                    json={"password_actual": "Admin123*", "password_nueva": OTRA_FUERTE, "password_confirmacion": OTRA_FUERTE})
    assert r.status_code == 200, r.text
    nueva_sesion = r.json()["access_token"]
    # La sesión que hizo el cambio continúa con el token nuevo; la anterior queda cerrada.
    assert client.get(f"{API}/servicios", headers=_h(nueva_sesion)).status_code == 200
    assert client.get(f"{API}/servicios", headers=headers_admin).status_code == 401
    assert _login(client, "admin", OTRA_FUERTE).status_code == 200

    db = SessionLocal()
    try:
        acciones = {a.accion for a in db.query(Auditoria).filter_by(entidad="administrador").all()}
        assert {"cambiar_password", "cambiar_password_fallido"} <= acciones
    finally:
        db.close()


def test_sin_permisos_no_se_cambian_contrasenas_por_la_api(client, datos_base, headers_admin, headers_usuario):
    otro = _crear_admin(client, headers_admin)
    visor = _crear_admin(client, headers_admin, usuario="visor@empresa.com", rol="visor_reservas")
    token_visor = _login(client, visor["usuario"], PASSWORD_FUERTE).json()["access_token"]
    cuerpo = {"password_nueva": OTRA_FUERTE, "password_confirmacion": OTRA_FUERTE}

    for headers, esperado in ((_h(token_visor), 403), (headers_usuario, 401), ({}, 401)):
        assert client.post(f"{API}/administradores/{otro['id']}/password", headers=headers, json=cuerpo).status_code == esperado
        assert client.post(f"{API}/auth/resetear-password", headers=headers,
                           json={"usuario": otro["usuario"], "password_nueva": OTRA_FUERTE}).status_code == esperado
        assert client.get(f"{API}/administradores", headers=headers).status_code == esperado
    assert _login(client, otro["usuario"], PASSWORD_FUERTE).status_code == 200  # nada cambió

    # El visor sí puede cambiar SU propia contraseña (con la actual).
    r = client.post(f"{API}/auth/cambiar-password", headers=_h(token_visor),
                    json={"password_actual": PASSWORD_FUERTE, "password_nueva": OTRA_FUERTE})
    assert r.status_code == 200


def test_token_sin_huella_de_contrasena_no_sirve(client, datos_base):
    viejo = create_access_token(subject="admin", scope="admin", entity_id=datos_base["admin_id"], rol="administrador")
    assert client.get(f"{API}/servicios", headers=_h(viejo)).status_code == 401


def test_listado_de_administradores_no_expone_contrasenas(client, datos_base, headers_admin):
    _crear_admin(client, headers_admin)
    for cuenta in client.get(f"{API}/administradores", headers=headers_admin).json():
        assert not {"password", "hash_password"} & set(cuenta)
        assert "password_actualizada_en" in cuenta


# ---- Firma de la plataforma (migración 0013) --------------------------------------------------

def _migracion_0013():
    ruta = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "0013_firma_y_passwords_admin.py"
    spec = importlib.util.spec_from_file_location("migracion_0013", ruta)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


@pytest.mark.parametrize("anterior,esperado", [
    ("SIGRA S.A.S", "InfraestructurEF"),
    ("SIGRA S.A.S.", "InfraestructurEF"),
    ("  Sigra SAS ", "InfraestructurEF"),
    ("", "InfraestructurEF"),
    (None, "InfraestructurEF"),
    ("Mi Empresa Propia", "Mi Empresa Propia"),  # un valor propio se respeta
])
def test_migracion_cambia_solo_la_firma_sigra(db, anterior, esperado):
    db.add_all([
        ConfiguracionGeneral(clave="empresa_nombre", valor=anterior),
        ConfiguracionGeneral(clave="contacto_correo", valor="talentohumano@sigra.com"),
    ])
    db.commit()
    _migracion_0013().aplicar_firma(db.connection())
    db.commit()
    valores = {c.clave: c.valor for c in db.query(ConfiguracionGeneral).all()}
    assert valores["empresa_nombre"] == esperado
    assert valores["contacto_correo"] == "talentohumano@sigra.com"  # el contacto no se toca


def test_migracion_crea_la_firma_si_no_existe(db):
    _migracion_0013().aplicar_firma(db.connection())
    db.commit()
    assert db.query(ConfiguracionGeneral).filter_by(clave="empresa_nombre").one().valor == "InfraestructurEF"


def test_administradores_existentes_conservan_su_acceso(db):
    """La columna nueva admite NULL: las cuentas creadas antes no necesitan datos nuevos."""
    from app.models import Rol
    from app.auth.security import hash_password

    rol = Rol(nombre="administrador")
    db.add(rol)
    db.flush()
    db.add(Administrador(usuario="antiguo", nombre="Antiguo", hash_password=hash_password("Admin123*"), rol_id=rol.id))
    db.commit()
    assert db.query(Administrador).filter_by(usuario="antiguo").one().password_actualizada_en is None
