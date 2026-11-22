"""Integración (MariaDB real): módulo de actividades e inscripciones.

Cubre: creación y administración de actividades y sesiones, inscripción de participantes,
control de cupos, cierre automático al alcanzar el límite, estados de actividad/sesión,
ventana de inscripción, cancelaciones, inscripción manual del admin y el correo de
confirmación (que nunca duplica ni revierte la inscripción si el SMTP falla).
"""
import threading
from datetime import date, datetime, timedelta
from unittest.mock import MagicMock, patch

from app.config import settings
from app.database.session import SessionLocal
from app.models import EstadoInscripcion, Inscripcion, Notificacion, Usuario
from app.auth.security import hash_password
from app.services.email_service import enviar_confirmacion_inscripcion
from app.services.errors import Conflict
from app.services.inscripcion_service import InscripcionService

API = "/api/v1"


def _en(dias: int) -> str:
    return (date.today() + timedelta(days=dias)).isoformat()


def _crear_actividad(client, headers_admin, **extra) -> dict:
    r = client.post(f"{API}/actividades", headers=headers_admin, json={
        "nombre": "Caminata ecológica", "descripcion_corta": "Recorrido de 5 km",
        "campos_formulario": [
            {"clave": "talla", "etiqueta": "Talla de camiseta", "tipo": "seleccion",
             "requerido": True, "opciones": ["S", "M", "L"]},
        ],
        **extra,
    })
    assert r.status_code == 201, r.text
    return r.json()


def _crear_sesion(client, headers_admin, actividad_id, cupo=2, dias=7) -> dict:
    r = client.post(f"{API}/actividades/{actividad_id}/sesiones", headers=headers_admin, json={
        "fecha": _en(dias), "hora_inicio": "08:00", "hora_fin": "11:00", "cupo_maximo": cupo,
        "lugar": "Entrada principal",
    })
    assert r.status_code == 201, r.text
    return r.json()


def _nuevo_usuario(correo: str) -> int:
    db = SessionLocal()
    try:
        u = Usuario(nombre="Otra", apellido="Persona", correo=correo, password_hash=hash_password("Clave1234*"))
        db.add(u)
        db.commit()
        return u.id
    finally:
        db.close()


def _login(client, correo: str) -> dict:
    r = client.post(f"{API}/cuenta/login", json={"correo": correo, "password": "Clave1234*"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_flujo_completo_inscripcion_y_cierre_por_cupo(client, datos_base, headers_admin, headers_usuario):
    actividad = _crear_actividad(client, headers_admin)
    sesion = _crear_sesion(client, headers_admin, actividad["id"], cupo=2)

    publica = client.get(f"{API}/actividades/publicas/{actividad['id']}").json()
    assert publica["estado_inscripcion"] == "abierta"
    assert publica["resumen"]["cupos_disponibles"] == 2
    assert publica["resumen"]["proximo_lugar"] == "Entrada principal"

    # Campo obligatorio del formulario.
    r = client.post(f"{API}/inscripciones", headers=headers_usuario, json={"sesion_id": sesion["id"], "respuestas": {}})
    assert r.status_code == 400
    r = client.post(f"{API}/inscripciones", headers=headers_usuario,
                    json={"sesion_id": sesion["id"], "respuestas": {"talla": "M", "extra": "ignorada"}})
    assert r.status_code == 201, r.text
    assert r.json()["respuestas_formulario"] == {"talla": "M"}

    # Duplicado: misma persona, misma sesión.
    r = client.post(f"{API}/inscripciones", headers=headers_usuario, json={"sesion_id": sesion["id"], "respuestas": {"talla": "M"}})
    assert r.status_code == 409

    sesiones = client.get(f"{API}/actividades/publicas/{actividad['id']}/sesiones", headers=headers_usuario).json()
    assert sesiones[0]["inscrito"] is True and sesiones[0]["cupos_disponibles"] == 1

    # Segunda persona llena el cupo → la sesión se cierra sola.
    _nuevo_usuario("segunda@example.com")
    r = client.post(f"{API}/inscripciones", headers=_login(client, "segunda@example.com"),
                    json={"sesion_id": sesion["id"], "respuestas": {"talla": "S"}})
    assert r.status_code == 201
    sesiones = client.get(f"{API}/actividades/publicas/{actividad['id']}/sesiones").json()
    assert sesiones[0]["estado"] == "cupo_lleno" and sesiones[0]["inscrito"] is None
    assert client.get(f"{API}/actividades/publicas/{actividad['id']}").json()["estado_inscripcion"] == "agotada"

    _nuevo_usuario("tercera@example.com")
    r = client.post(f"{API}/inscripciones", headers=_login(client, "tercera@example.com"),
                    json={"sesion_id": sesion["id"], "respuestas": {"talla": "L"}})
    assert r.status_code == 409

    # El admin tampoco puede superar el cupo.
    r = client.post(f"{API}/inscripciones/manual", headers=headers_admin,
                    json={"correo": "tercera@example.com", "sesion_id": sesion["id"]})
    assert r.status_code == 409

    # Cancelar libera el cupo y reabre la sesión.
    mia = client.get(f"{API}/inscripciones/mias", headers=headers_usuario).json()[0]
    assert mia["puede_cancelar"] is True and mia["sesion_lugar"] == "Entrada principal"
    assert client.post(f"{API}/inscripciones/{mia['id']}/cancelar", headers=headers_usuario).status_code == 200
    assert client.get(f"{API}/actividades/publicas/{actividad['id']}").json()["estado_inscripcion"] == "abierta"

    # El admin consulta y gestiona los inscritos.
    inscritos = client.get(f"{API}/inscripciones", headers=headers_admin, params={"sesion_id": sesion["id"]}).json()
    assert {i["estado"] for i in inscritos} == {"activa", "cancelada"}


def test_concurrencia_no_supera_el_cupo(client, datos_base, headers_admin):
    actividad = _crear_actividad(client, headers_admin, campos_formulario=[])
    sesion = _crear_sesion(client, headers_admin, actividad["id"], cupo=1)
    ids = [_nuevo_usuario(f"c{i}@example.com") for i in range(4)]
    barrera = threading.Barrier(len(ids))
    resultados = []

    def intentar(uid):
        db = SessionLocal()
        try:
            barrera.wait(timeout=5)
            InscripcionService(db).crear(sesion["id"], {}, uid)
            resultados.append("ok")
        except Conflict:
            resultados.append("conflicto")
        except Exception as exc:  # noqa: BLE001
            resultados.append(repr(exc))
        finally:
            db.close()

    hilos = [threading.Thread(target=intentar, args=(u,)) for u in ids]
    for h in hilos:
        h.start()
    for h in hilos:
        h.join(timeout=15)
    assert resultados.count("ok") == 1, resultados
    assert resultados.count("conflicto") == len(ids) - 1


def test_ventana_de_inscripcion_y_estados(client, datos_base, headers_admin, headers_usuario):
    apertura = (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%dT%H:%M")
    actividad = _crear_actividad(client, headers_admin, campos_formulario=[], fecha_apertura_inscripciones=apertura)
    sesion = _crear_sesion(client, headers_admin, actividad["id"], cupo=5, dias=10)
    assert client.get(f"{API}/actividades/publicas/{actividad['id']}").json()["estado_inscripcion"] == "proximamente"
    r = client.post(f"{API}/inscripciones", headers=headers_usuario, json={"sesion_id": sesion["id"]})
    assert r.status_code == 409
    # El administrador sí puede inscribir fuera de la ventana (no fuera del cupo).
    r = client.post(f"{API}/inscripciones/manual", headers=headers_admin,
                    json={"correo": "colaborador.demo@example.com", "sesion_id": sesion["id"]})
    assert r.status_code == 201, r.text

    r = client.put(f"{API}/actividades/{actividad['id']}", headers=headers_admin, json={"inscripcion_abierta": False})
    assert r.json()["estado_inscripcion"] == "cerrada"


def test_actividad_sin_sesiones_futuras_no_se_anuncia(client, datos_base, headers_admin):
    actividad = _crear_actividad(client, headers_admin, campos_formulario=[])
    assert actividad["estado_inscripcion"] == "finalizada"
    assert actividad["id"] not in [a["id"] for a in client.get(f"{API}/actividades/publicas").json()]
    _crear_sesion(client, headers_admin, actividad["id"])
    assert actividad["id"] in [a["id"] for a in client.get(f"{API}/actividades/publicas").json()]


def test_actividad_inactiva_no_expone_sesiones(client, datos_base, headers_admin):
    actividad = _crear_actividad(client, headers_admin, campos_formulario=[])
    _crear_sesion(client, headers_admin, actividad["id"])
    client.post(f"{API}/actividades/{actividad['id']}/desactivar", headers=headers_admin)
    assert client.get(f"{API}/actividades/publicas/{actividad['id']}/sesiones").status_code == 404
    assert client.post(f"{API}/actividades/{actividad['id']}/activar", headers=headers_admin).json()["activo"] is True


def test_validaciones_de_sesiones(client, datos_base, headers_admin, headers_usuario):
    actividad = _crear_actividad(client, headers_admin, campos_formulario=[])
    # Fecha pasada.
    r = client.post(f"{API}/actividades/{actividad['id']}/sesiones", headers=headers_admin,
                    json={"fecha": _en(-1), "hora_inicio": "08:00", "hora_fin": "09:00"})
    assert r.status_code == 400
    sesion = _crear_sesion(client, headers_admin, actividad["id"], cupo=3)
    # Duplicada.
    r = client.post(f"{API}/actividades/{actividad['id']}/sesiones", headers=headers_admin,
                    json={"fecha": sesion["fecha"], "hora_inicio": "08:00", "hora_fin": "09:00"})
    assert r.status_code == 400
    # Cupo menor que los inscritos.
    client.post(f"{API}/inscripciones", headers=headers_usuario, json={"sesion_id": sesion["id"]})
    _nuevo_usuario("x@example.com")
    client.post(f"{API}/inscripciones", headers=_login(client, "x@example.com"), json={"sesion_id": sesion["id"]})
    r = client.put(f"{API}/actividades/sesiones/{sesion['id']}", headers=headers_admin, json={"cupo_maximo": 1})
    assert r.status_code == 400
    r = client.put(f"{API}/actividades/sesiones/{sesion['id']}", headers=headers_admin, json={"cupo_maximo": 2})
    assert r.status_code == 200 and r.json()["estado"] == "cupo_lleno"
    # Hora fin anterior.
    r = client.put(f"{API}/actividades/sesiones/{sesion['id']}", headers=headers_admin, json={"hora_fin": "07:00"})
    assert r.status_code == 400


def test_generar_lote_no_duplica_ni_crea_pasadas(client, datos_base, headers_admin):
    actividad = _crear_actividad(client, headers_admin, campos_formulario=[])
    cuerpo = {"fecha_inicio": _en(-7), "fecha_fin": _en(13), "dias_semana": [0, 1, 2, 3, 4, 5, 6],
              "hora_inicio": "18:00", "hora_fin": "19:00", "cupo_maximo": 10}
    r = client.post(f"{API}/actividades/{actividad['id']}/sesiones/generar", headers=headers_admin, json=cuerpo)
    assert r.status_code == 200, r.text
    creadas = len(r.json())
    assert 13 <= creadas <= 14  # hoy cuenta solo si las 18:00 todavía no pasaron
    r = client.post(f"{API}/actividades/{actividad['id']}/sesiones/generar", headers=headers_admin, json=cuerpo)
    assert r.status_code == 400  # todo ya existe


def test_no_se_cancela_inscripcion_de_sesion_ya_ocurrida(client, datos_base, headers_admin, headers_usuario, db):
    actividad = _crear_actividad(client, headers_admin, campos_formulario=[])
    sesion = _crear_sesion(client, headers_admin, actividad["id"])
    insc = client.post(f"{API}/inscripciones", headers=headers_usuario, json={"sesion_id": sesion["id"]}).json()
    fila = db.get(Inscripcion, insc["id"])
    fila.sesion.fecha = date.today() - timedelta(days=1)
    db.commit()
    assert client.post(f"{API}/inscripciones/{insc['id']}/cancelar", headers=headers_usuario).status_code == 400
    # El admin sí marca la asistencia.
    r = client.post(f"{API}/inscripciones/{insc['id']}/asistencia", headers=headers_admin, json={"asistio": True})
    assert r.status_code == 200 and r.json()["estado"] == EstadoInscripcion.COMPLETADA.value


def test_correo_de_confirmacion_de_inscripcion(client, datos_base, headers_admin, headers_usuario, monkeypatch):
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com")
    monkeypatch.setattr(settings, "SMTP_PORT", 587)
    monkeypatch.setattr(settings, "SMTP_FROM", "no-reply@example.com")
    actividad = _crear_actividad(client, headers_admin, campos_formulario=[], informacion_adicional="Lleva agua")
    sesion = _crear_sesion(client, headers_admin, actividad["id"])

    servidor = MagicMock()
    with patch("app.services.email_service.smtplib.SMTP") as MockSMTP:
        MockSMTP.return_value.__enter__.return_value = servidor
        r = client.post(f"{API}/inscripciones", headers=headers_usuario, json={"sesion_id": sesion["id"]})
    assert r.status_code == 201
    mensaje = servidor.send_message.call_args[0][0]
    texto = mensaje.get_body(preferencelist=("plain",)).get_content()
    assert "Caminata ecológica" in mensaje["Subject"]
    assert "Entrada principal" in texto and "Lleva agua" in texto and "Inscripción confirmada" in texto

    db = SessionLocal()
    try:
        notif = db.query(Notificacion).filter_by(inscripcion_id=r.json()["id"]).one()
        assert notif.tipo == "confirmacion_inscripcion" and notif.estado == "enviado"
    finally:
        db.close()


def test_fallo_de_correo_no_duplica_ni_revierte_la_inscripcion(client, datos_base, headers_admin, headers_usuario, monkeypatch):
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com")
    monkeypatch.setattr("app.services.email_service.PAUSA_ENTRE_INTENTOS_SEG", 0)
    actividad = _crear_actividad(client, headers_admin, campos_formulario=[])
    sesion = _crear_sesion(client, headers_admin, actividad["id"])
    with patch("app.services.email_service.smtplib.SMTP", side_effect=OSError("SMTP caído")):
        r = client.post(f"{API}/inscripciones", headers=headers_usuario, json={"sesion_id": sesion["id"]})
    assert r.status_code == 201
    db = SessionLocal()
    try:
        assert db.query(Inscripcion).filter_by(sesion_id=sesion["id"]).count() == 1
        notif = db.query(Notificacion).filter_by(inscripcion_id=r.json()["id"]).one()
        assert notif.estado == "fallido" and notif.intentos == 2 and "SMTP caído" in notif.error_mensaje
    finally:
        db.close()
    # Reenviar a mano tampoco duplica la inscripción: solo agrega otra notificación.
    enviar_confirmacion_inscripcion(r.json()["id"])


def test_cancelacion_admin_notifica_al_participante(client, datos_base, headers_admin, headers_usuario):
    actividad = _crear_actividad(client, headers_admin, campos_formulario=[])
    sesion = _crear_sesion(client, headers_admin, actividad["id"])
    insc = client.post(f"{API}/inscripciones", headers=headers_usuario, json={"sesion_id": sesion["id"]}).json()
    r = client.post(f"{API}/inscripciones/{insc['id']}/cancelar-admin", headers=headers_admin,
                    json={"motivo": "Clima", "notificar": True})
    assert r.status_code == 200 and r.json()["estado"] == "cancelada"
    db = SessionLocal()
    try:
        assert db.query(Notificacion).filter_by(inscripcion_id=insc["id"], tipo="cancelacion_inscripcion").count() == 1
    finally:
        db.close()
