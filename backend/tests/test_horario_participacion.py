from datetime import timedelta

import pytest

from app.models import Notificacion
from app.services import actividad_service, horario_service, servicio_service
from app.utils import time as reloj
from app.repositories import agenda_repository
from tests.test_vigencia_restricciones import (
    API, _crear_actividad, _crear_sesion, _inscribir, _reservar, _vigencia,
)


@pytest.fixture
def controlar_reloj(monkeypatch):
    real = reloj.now()
    apertura = (real + timedelta(days=2)).replace(hour=9, minute=0, second=0, microsecond=0)
    publicacion = apertura - timedelta(days=1)
    cierre = apertura + timedelta(hours=1)
    actual = publicacion - timedelta(seconds=1)

    def cambiar(momento):
        nonlocal actual
        actual = momento

    for modulo in (reloj, actividad_service, horario_service, servicio_service, agenda_repository):
        monkeypatch.setattr(modulo, "now", lambda: actual)
    return cambiar, publicacion, apertura, cierre


@pytest.mark.parametrize("tipo", ["inscripcion", "reserva"])
def test_publicacion_apertura_y_cierre_por_api(
    tipo, client, datos_base, headers_admin, headers_usuario, controlar_reloj,
):
    cambiar, publicacion, apertura, cierre = controlar_reloj
    dia = apertura.date()
    horario = {
        "vigencia_inicio": dia.isoformat(),
        "vigencia_fin": dia.isoformat(),
        "publicacion_en": publicacion.replace(tzinfo=None).isoformat(),
        "hora_apertura": "09:00",
        "hora_cierre": "10:00",
    }

    if tipo == "inscripcion":
        actividad = _crear_actividad(client, headers_admin, datos_base["area_id"], **horario)
        actividad_id = actividad["id"]
        sesion = _crear_sesion(client, headers_admin, actividad_id, 3, "14:00")
        catalogo = "/actividades/publicas"
        detalle = f"{catalogo}/{actividad_id}"
        registro = lambda: _inscribir(client, headers_usuario, sesion["id"])
        abierto = lambda datos: datos["inscripcion_disponible"]
    else:
        sid, aid = datos_base["servicio_id"], datos_base["agenda_id"]
        extras = {k: v for k, v in horario.items() if k not in ("vigencia_inicio", "vigencia_fin")}
        _vigencia(client, headers_admin, sid, dia, dia, **extras)
        catalogo = "/eventos"
        detalle = f"{catalogo}/{sid}"
        registro = lambda: _reservar(client, headers_usuario, aid, dia, "14:00")
        abierto = lambda datos: dia.isoformat() in datos["dias_reservables"]

    def detalle_publico():
        return client.get(f"{API}{detalle}")

    def en_catalogo():
        evento_id = int(detalle.rsplit("/", 1)[1])
        return any(e["id"] == evento_id for e in client.get(f"{API}{catalogo}").json())

    assert not en_catalogo()
    assert detalle_publico().status_code == 404
    assert registro().status_code == 400
    cambiar(publicacion)
    assert en_catalogo()
    assert detalle_publico().status_code == 200
    assert not abierto(detalle_publico().json())
    assert detalle_publico().json()["proximo_cambio_en"] == apertura.isoformat()
    cambiar(apertura - timedelta(seconds=1))
    assert not abierto(detalle_publico().json())
    if tipo == "reserva":
        assert client.get(f"{API}/agendas/{aid}/horarios", params={"fecha": dia}).status_code == 404
    assert registro().status_code == 400
    cambiar(apertura)
    assert abierto(detalle_publico().json())
    assert detalle_publico().json()["proximo_cambio_en"] == cierre.isoformat()
    assert registro().status_code == 201
    cambiar(cierre)
    assert not abierto(detalle_publico().json())
    respuesta = registro()
    assert respuesta.status_code == 400 and "cerró" in respuesta.json()["detail"]
    cambiar(cierre + timedelta(days=1))
    assert en_catalogo()
    assert not abierto(detalle_publico().json())


@pytest.mark.parametrize("tipo", ["reservas", "inscripciones"])
def test_solo_admin_elimina_canceladas_y_conserva_notificaciones(
    tipo, client, db, datos_base, headers_admin, headers_usuario,
):
    if tipo == "reservas":
        fecha = reloj.today() + timedelta(days=2)
        creada = _reservar(client, headers_usuario, datos_base["agenda_id"], fecha)
        enlace = "reserva_id"
    else:
        actividad = _crear_actividad(client, headers_admin, datos_base["area_id"])
        sesion = _crear_sesion(client, headers_admin, actividad["id"], 2)
        creada = _inscribir(client, headers_usuario, sesion["id"])
        enlace = "inscripcion_id"
    assert creada.status_code == 201, creada.text
    registro_id = creada.json()["id"]
    url = f"{API}/{tipo}/{registro_id}"
    assert client.delete(f"{url}/cancelada", headers=headers_admin).status_code == 409

    aviso = Notificacion(tipo="email", destinatario="test@example.com", **{enlace: registro_id})
    db.add(aviso)
    db.commit()
    aviso_id = aviso.id
    assert client.post(f"{url}/cancelar-admin", headers=headers_admin, json={"notificar": False}).status_code == 200
    assert client.delete(f"{url}/cancelada", headers=headers_usuario).status_code in (401, 403)
    assert client.delete(f"{url}/cancelada", headers=headers_admin).status_code == 204
    assert client.delete(f"{url}/cancelada", headers=headers_admin).status_code == 404
    db.expire_all()
    assert getattr(db.get(Notificacion, aviso_id), enlace) is None


def test_titulo_bienvenida_se_guarda_y_se_publica(client, headers_admin):
    url = f"{API}/configuracion"
    assert client.get(url).json()["titulo_bienvenida"] is None
    titulo = "Bienvenidos a la semana de bienestar"
    valor = {"clave": "titulo_bienvenida", "valor": titulo}
    assert client.put(url, json=valor).status_code == 401
    assert client.put(url, headers=headers_admin, json=valor).status_code == 204
    assert client.get(url).json()["titulo_bienvenida"] == titulo
    assert client.put(url, headers=headers_admin, json={**valor, "valor": " "}).status_code == 204
    assert client.get(url).json()["titulo_bienvenida"] is None


@pytest.mark.parametrize("dias_hasta_atencion", [-1, 1])
def test_apertura_reservas_es_independiente_del_primer_dia_de_atencion(
    dias_hasta_atencion, client, datos_base, headers_admin, headers_usuario, controlar_reloj,
):
    cambiar, _, apertura, _ = controlar_reloj
    inicio = apertura.date() + timedelta(days=dias_hasta_atencion)
    fin = apertura.date() + timedelta(days=4)
    turno = max(inicio, apertura.date()) + timedelta(days=1)
    configurada = apertura.replace(tzinfo=None).isoformat()
    respuesta = client.post(f"{API}/servicios", headers=headers_admin, json={
        "nombre": "Masaje con apertura independiente",
        "vigencia_inicio": inicio.isoformat(),
        "vigencia_fin": fin.isoformat(),
        "apertura_reservas_en": configurada,
        "agendas": [{
            "area_id": datos_base["area_id"], "hora_inicio": "08:00", "hora_fin": "17:00",
            "duracion_minutos": 30, "dias_habilitados": "0,1,2,3,4,5,6",
        }],
    })
    assert respuesta.status_code == 201, respuesta.text
    evento_id = respuesta.json()["id"]
    assert respuesta.json()["apertura_reservas_en"] == configurada
    url = f"{API}/eventos/{evento_id}"
    agenda_id = client.get(url).json()["agendas"][0]["id"]

    cambiar(apertura - timedelta(seconds=1))
    detalle = client.get(url).json()
    assert detalle["dias_reservables"] == []
    assert "Las reservas estarán habilitadas" in detalle["motivo_no_disponible"]
    assert detalle["proximo_cambio_en"] == apertura.isoformat()
    assert _reservar(client, headers_usuario, agenda_id, turno).status_code == 400

    cambiar(apertura)
    detalle = client.get(url).json()
    assert detalle["dias_reservables"][0] == max(inicio, apertura.date()).isoformat()
    assert _reservar(client, headers_usuario, agenda_id, turno).status_code == 201

    nueva = apertura + timedelta(days=2)
    url_admin = f"{API}/servicios/{evento_id}"
    editado = client.put(url_admin, headers=headers_admin, json={
        "apertura_reservas_en": nueva.replace(tzinfo=None).isoformat(),
    })
    assert editado.status_code == 200, editado.text
    assert editado.json()["vigencia_inicio"] == inicio.isoformat()
    assert client.get(url).json()["proximo_cambio_en"] == nueva.isoformat()
    assert _reservar(client, headers_usuario, agenda_id, turno).status_code == 400

    invalida = client.put(url_admin, headers=headers_admin, json={
        "apertura_reservas_en": (fin + timedelta(days=1)).isoformat() + "T09:00:00",
    })
    assert invalida.status_code == 400
    assert client.get(url).json()["proximo_cambio_en"] == nueva.isoformat()
