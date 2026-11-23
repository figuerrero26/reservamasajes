"""Pruebas unitarias PURAS (sin base de datos) de la vigencia de los eventos, los límites de
participación por persona, la redacción de las reglas y la validación de imágenes.
Corren en cualquier equipo con `pytest`."""
import asyncio
import io
from datetime import date, timedelta
from types import SimpleNamespace

import pytest
from pydantic import ValidationError
from starlette.datastructures import Headers, UploadFile

from app.schemas.actividad import describir_regla_inscripcion
from app.schemas.servicio import ServicioCreate, ServicioUpdate, describir_regla_reserva
from app.services import imagen_service
from app.services.errors import DomainError
from app.services.horario_service import motivo_no_reservable
from app.services.reserva_service import MENSAJE_UNA_POR_DIA, motivo_limite_reserva
from app.services.servicio_service import normalizar_regla_reserva
from app.utils.uploads import es_imagen_valida, normalizar_url_imagen
from app.utils.vigencia import (
    acepta_participaciones, estado_vigencia, fecha_en_vigencia, formato_fecha, motivo_fuera_de_vigencia,
    motivo_limite, para_administrador, ventana_limite,
)

HOY = date(2030, 1, 15)  # martes
INICIO, FIN = date(2030, 1, 10), date(2030, 1, 20)


# ---- Estado de vigencia ---------------------------------------------------------------------

@pytest.mark.parametrize("hoy,esperado", [
    (date(2030, 1, 9), "proximo"),
    (INICIO, "vigente"),          # el día de inicio ya recibe participaciones
    (HOY, "vigente"),
    (FIN, "vigente"),             # el día final todavía también
    (date(2030, 1, 21), "finalizado"),  # desde la medianoche siguiente al fin
])
def test_estado_vigencia_con_dias_incluidos(hoy, esperado):
    assert estado_vigencia(INICIO, FIN, hoy) == esperado
    assert acepta_participaciones(INICIO, FIN, hoy) is (esperado == "vigente")


def test_eventos_sin_vigencia_y_con_una_sola_fecha():
    assert estado_vigencia(None, None, HOY) == "sin_vigencia"
    assert acepta_participaciones(None, None, HOY) is True
    assert estado_vigencia(date(2030, 2, 1), None, HOY) == "proximo"
    assert estado_vigencia(None, date(2030, 1, 1), HOY) == "finalizado"


def test_fecha_en_vigencia():
    assert fecha_en_vigencia(INICIO, FIN, INICIO) and fecha_en_vigencia(INICIO, FIN, FIN)
    assert not fecha_en_vigencia(INICIO, FIN, FIN + timedelta(days=1))
    assert not fecha_en_vigencia(INICIO, FIN, INICIO - timedelta(days=1))
    assert fecha_en_vigencia(None, None, date(1999, 1, 1))


def test_motivos_fuera_de_vigencia():
    assert motivo_fuera_de_vigencia(INICIO, FIN, HOY) is None
    assert motivo_fuera_de_vigencia(INICIO, FIN, date(2030, 1, 1)) == "Este evento abre sus reservas el 10 de enero de 2030."
    assert motivo_fuera_de_vigencia(INICIO, FIN, date(2030, 2, 1), "inscripciones") == (
        "Este evento finalizó el 20 de enero de 2030 y ya no recibe inscripciones."
    )
    assert formato_fecha(date(2026, 11, 30)) == "30 de noviembre de 2026"


def _agenda(activo=True, servicio_activo=True, area_activa=True, inicio=INICIO, fin=FIN):
    servicio = SimpleNamespace(activo=servicio_activo, vigencia_inicio=inicio, vigencia_fin=fin)
    return SimpleNamespace(activo=activo, servicio=servicio, area=SimpleNamespace(activo=area_activa))


def test_agenda_reservable_combina_flags_y_vigencia():
    assert motivo_no_reservable(_agenda(), HOY) is None
    assert "no está disponible" in motivo_no_reservable(_agenda(servicio_activo=False), HOY)
    assert "no está disponible" in motivo_no_reservable(_agenda(area_activa=False), HOY)
    assert "abre sus reservas" in motivo_no_reservable(_agenda(), date(2030, 1, 1))
    assert "finalizó" in motivo_no_reservable(_agenda(), date(2030, 1, 21))
    assert motivo_no_reservable(_agenda(inicio=None, fin=None), HOY) is None  # evento antiguo


# ---- Ventanas y límites de participación ------------------------------------------------------

def test_ventana_de_cada_periodo():
    assert ventana_limite(HOY, "dia") == (HOY, HOY)
    assert ventana_limite(HOY, "semana") == (date(2030, 1, 14), date(2030, 1, 20))  # lunes a domingo
    assert ventana_limite(HOY, "mes") == (date(2030, 1, 1), date(2030, 1, 31))
    assert ventana_limite(date(2030, 12, 5), "mes") == (date(2030, 12, 1), date(2030, 12, 31))
    assert ventana_limite(date(2028, 2, 10), "mes") == (date(2028, 2, 1), date(2028, 2, 29))  # bisiesto
    # Toda la vigencia: desde su inicio y sin tope final.
    assert ventana_limite(HOY, "evento", INICIO) == (INICIO, None)
    assert ventana_limite(HOY, "evento", None) == (None, None)


def test_limite_una_sola_vez_en_toda_la_vigencia():
    previas = [date(2030, 1, 11)]
    motivo = motivo_limite(previas, HOY, 1, "evento", INICIO, "reserva")
    assert motivo and "solo se permite una por persona" in motivo
    # Participaciones de una vigencia anterior (antes del inicio actual) no cuentan.
    assert motivo_limite([date(2029, 8, 17)], HOY, 1, "evento", INICIO, "reserva") is None
    assert motivo_limite([], HOY, 1, "evento", INICIO, "reserva") is None


def test_limite_por_semana_y_por_mes():
    semana = [date(2030, 1, 14), date(2030, 1, 16)]
    assert motivo_limite(semana, HOY, 2, "semana", INICIO, "inscripción") == (
        "Ya alcanzaste el máximo de 2 inscripciones en este evento esa semana."
    )
    assert motivo_limite(semana, HOY, 3, "semana", INICIO, "inscripción") is None
    # La semana siguiente empieza de cero.
    assert motivo_limite(semana, date(2030, 1, 21), 2, "semana", INICIO, "inscripción") is None
    assert motivo_limite([date(2030, 1, 2)], HOY, 1, "mes", None, "reserva") == "Ya tienes una reserva en este evento ese mes."
    assert motivo_limite([date(2030, 1, 2)], HOY, None, "mes", None, "reserva") is None  # sin límite


def test_eventos_por_turnos_siempre_una_reserva_por_dia():
    servicio = SimpleNamespace(limite_participaciones=3, periodo_limite="semana", vigencia_inicio=INICIO)
    assert motivo_limite_reserva(servicio, [HOY], HOY) == MENSAJE_UNA_POR_DIA
    assert motivo_limite_reserva(servicio, [date(2030, 1, 14), date(2030, 1, 16)], HOY) is None
    assert motivo_limite_reserva(servicio, [date(2030, 1, 14), date(2030, 1, 16), date(2030, 1, 17)], HOY)


def test_normalizacion_de_la_regla_de_eventos_por_turnos():
    assert normalizar_regla_reserva(None, "semana") == (1, "dia")  # sin tope adicional = 1 por día
    assert normalizar_regla_reserva(1, "evento") == (1, "evento")
    assert normalizar_regla_reserva(3, "semana") == (3, "semana")
    with pytest.raises(DomainError):
        normalizar_regla_reserva(2, "dia")


def test_redaccion_de_las_reglas():
    assert describir_regla_reserva(1, "dia") == "Una reserva por persona por día; puedes repetir en días diferentes."
    assert describir_regla_reserva(1, "evento") == "Una sola reserva por persona durante toda la vigencia del evento."
    assert describir_regla_reserva(3, "semana") == "Hasta 3 reservas por persona por semana, en días distintos."
    # Las inscripciones se describen en fechas (sesiones), nunca en turnos ni días de reserva.
    assert describir_regla_inscripcion(None, "evento") == (
        "Sin límite por persona: puedes inscribirte en todas las fechas que quieras (una vez en cada una)."
    )
    assert describir_regla_inscripcion(1, "evento") == (
        "Una sola inscripción por persona: puedes participar en una de las fechas de esta actividad."
    )
    assert describir_regla_inscripcion(3, "evento") == "Hasta 3 inscripciones por persona en esta actividad (una por fecha)."
    assert describir_regla_inscripcion(1, "semana") == "Una inscripción por persona por semana."
    assert describir_regla_inscripcion(2, "mes") == "Hasta 2 inscripciones por persona por mes."


def test_mensajes_para_el_administrador():
    assert para_administrador("Ya tienes una reserva en este evento ese mes.") == (
        "El colaborador ya tiene una reserva en este evento ese mes."
    )
    assert para_administrador("Ya alcanzaste el máximo de 2 reservas.").startswith("El colaborador ya alcanzó")
    assert para_administrador("Otro motivo") == "Otro motivo"


# ---- Esquemas: vigencia obligatoria y regla por defecto ----------------------------------------

def _evento(**cambios):
    base = dict(nombre="Yoga", vigencia_inicio=INICIO, vigencia_fin=FIN,
                agenda={"area_id": 1, "hora_inicio": "08:00", "hora_fin": "12:00", "duracion_minutos": 30})
    return ServicioCreate(**{**base, **cambios})


def test_evento_por_turnos_exige_vigencia_coherente():
    evento = _evento()
    assert (evento.limite_participaciones, evento.periodo_limite) == (1, "dia")
    with pytest.raises(ValidationError):
        ServicioCreate(nombre="Yoga", agenda=_evento().agenda.model_dump())  # sin vigencia
    with pytest.raises(ValidationError):
        _evento(vigencia_inicio=FIN, vigencia_fin=INICIO)
    with pytest.raises(ValidationError):
        _evento(periodo_limite="anio")
    with pytest.raises(ValidationError):
        _evento(limite_participaciones=0)


# ---- Imágenes ----------------------------------------------------------------------------------

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
WEBP = b"RIFF\x00\x00\x00\x00WEBPVP8 " + b"\x00" * 64


@pytest.mark.parametrize("valor,esperado", [
    ("https://cdn.ejemplo.com/foto.jpg", "https://cdn.ejemplo.com/foto.jpg"),
    ("  http://ejemplo.com/a.png  ", "http://ejemplo.com/a.png"),
    ("/api/uploads/evento_abc.png", "/api/uploads/evento_abc.png"),
    ("", None),
    (None, None),
])
def test_url_de_imagen_valida(valor, esperado):
    assert normalizar_url_imagen(valor) == esperado


@pytest.mark.parametrize("valor", [
    "javascript:alert(1)", "data:image/png;base64,AAAA", "foto.jpg", "/etc/passwd", "ftp://x.com/a.png",
    "https://ejemplo.com/foto con espacios.jpg",
])
def test_url_de_imagen_invalida(valor):
    with pytest.raises(ValueError):
        normalizar_url_imagen(valor)
    with pytest.raises(ValidationError):
        ServicioUpdate(imagen_url=valor)


def test_firma_del_archivo_debe_coincidir_con_el_tipo():
    assert es_imagen_valida("image/png", PNG)
    assert es_imagen_valida("image/jpeg", JPG)
    assert es_imagen_valida("image/webp", WEBP)
    assert not es_imagen_valida("image/png", JPG)
    assert not es_imagen_valida("image/png", b"<script>alert(1)</script>")
    assert not es_imagen_valida("image/webp", b"RIFF\x00\x00\x00\x00WAVEfmt ")
    assert not es_imagen_valida("image/svg+xml", b"<svg/>")  # SVG no se acepta (puede llevar scripts)


def _archivo(contenido: bytes, tipo: str) -> UploadFile:
    return UploadFile(io.BytesIO(contenido), filename="imagen", headers=Headers({"content-type": tipo}))


def test_guardar_imagen_valida_formato_tamano_y_contenido(tmp_path, monkeypatch):
    monkeypatch.setattr(imagen_service, "UPLOAD_DIR", tmp_path)
    url = asyncio.run(imagen_service.guardar_imagen_evento(_archivo(PNG, "image/png")))
    assert url.startswith("/api/uploads/evento_") and url.endswith(".png")
    assert (tmp_path / url.rsplit("/", 1)[1]).read_bytes() == PNG

    for contenido, tipo in ((PNG, "image/svg+xml"), (b"texto", "image/png"), (b"", "image/png")):
        with pytest.raises(DomainError):
            asyncio.run(imagen_service.guardar_imagen_evento(_archivo(contenido, tipo)))
    monkeypatch.setattr(imagen_service, "TAMANO_MAXIMO_IMAGEN_EVENTO", 32)
    with pytest.raises(DomainError, match="no puede superar"):
        asyncio.run(imagen_service.guardar_imagen_evento(_archivo(PNG, "image/png")))
    assert len(list(tmp_path.iterdir())) == 1  # los rechazados no dejan archivos
