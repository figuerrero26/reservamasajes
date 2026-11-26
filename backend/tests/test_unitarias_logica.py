"""Pruebas unitarias PURAS (sin base de datos): corren en cualquier equipo con `pytest`.

Reproducen los problemas encontrados en el diagnóstico y verifican su corrección a nivel de
lógica: grilla de turnos cerca de la medianoche, validaciones de agenda/sesiones/
configuración, la evaluación de estados de actividades y sesiones, y la vigencia de los
eventos (ver también test_vigencia_unitarias.py).
"""
import threading
from datetime import date, datetime, time, timedelta
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.schemas.actividad import ActividadCreate, CampoFormulario
from app.schemas.agenda import AgendaCreate, AgendaUpdate, normalizar_dias, validar_horario
from app.schemas.bloqueo import BloqueoCreate
from app.schemas.sesion import GenerarSesionesIn, SesionCreate
from app.services import actividad_service
from app.services.configuracion_service import validar_valor_configuracion
from app.services.errors import DomainError
from app.services.horario_service import MAX_SLOTS_POR_DIA, grilla_agenda
from app.utils.time import TZ, add_minutes


def _grilla_con_tope(*args, segundos=2.0):
    """Ejecuta grilla_agenda en un hilo con tiempo límite: si el bug del bucle infinito
    volviera, la prueba falla en vez de colgar toda la suite."""
    resultado = {}
    hilo = threading.Thread(target=lambda: resultado.setdefault("v", grilla_agenda(*args)), daemon=True)
    hilo.start()
    hilo.join(segundos)
    assert not hilo.is_alive(), "grilla_agenda no terminó: bucle infinito"
    return resultado["v"]


# ---------------------------------------------------------------------------------------
# Problema 1: agendas cercanas a la medianoche (bucle infinito)
# ---------------------------------------------------------------------------------------

@pytest.mark.parametrize("hora_inicio,hora_fin,duracion,esperados", [
    (time(20, 0), time(23, 45), 30, 7),   # caso reportado: 20:00…23:00 (23:30–00:00 no cabe)
    (time(8, 0), time(23, 59), 30, 31),   # "todo el día"
    (time(23, 0), time(23, 59), 30, 1),
    (time(0, 0), time(23, 59), 5, 287),
    (time(8, 0), time(17, 0), 30, 18),    # caso normal, sin cambios de comportamiento
])
def test_grilla_termina_y_nunca_supera_hora_fin(hora_inicio, hora_fin, duracion, esperados):
    franjas = _grilla_con_tope(hora_inicio, hora_fin, duracion)
    assert len(franjas) == esperados
    assert all(f.hora_fin <= hora_fin for f in franjas)
    assert all(f.hora_inicio < f.hora_fin for f in franjas)  # ninguna "da la vuelta"


def test_grilla_con_duracion_invalida_no_genera_turnos():
    assert _grilla_con_tope(time(8, 0), time(17, 0), 0) == []
    assert _grilla_con_tope(time(8, 0), time(17, 0), -15) == []


def test_grilla_respeta_tope_de_seguridad():
    franjas = _grilla_con_tope(time(0, 0), time(23, 59), 1)
    assert len(franjas) == MAX_SLOTS_POR_DIA


def test_grilla_excluye_almuerzo_total_y_parcial():
    franjas = grilla_agenda(time(8, 0), time(14, 0), 45, time(12, 0), time(13, 0))
    inicios = [f.hora_inicio for f in franjas]
    # 11:45–12:30 y 12:30–13:15 se cruzan con el almuerzo: no existen.
    assert time(11, 45) not in inicios and time(12, 30) not in inicios
    assert time(13, 15) in inicios


def test_add_minutes_no_da_la_vuelta_a_medianoche():
    assert add_minutes(time(23, 0), 30) == time(23, 30)
    with pytest.raises(ValueError):
        add_minutes(time(23, 45), 30)


# ---------------------------------------------------------------------------------------
# Validaciones de agenda
# ---------------------------------------------------------------------------------------

def _agenda(**cambios):
    base = dict(nombre="A", area_id=1, servicio_id=1, hora_inicio=time(8), hora_fin=time(17), duracion_minutos=30)
    return AgendaCreate(**{**base, **cambios})


def test_agenda_rechaza_duracion_fuera_de_rango():
    with pytest.raises(ValidationError):
        _agenda(duracion_minutos=0)
    with pytest.raises(ValidationError):
        AgendaUpdate(duracion_minutos=0)
    with pytest.raises(ValidationError):
        AgendaUpdate(duracion_minutos=1000)


def test_agenda_rechaza_horario_mas_corto_que_un_turno():
    with pytest.raises(ValidationError):
        _agenda(hora_inicio=time(23, 50), hora_fin=time(23, 59), duracion_minutos=30)


def test_agenda_rechaza_almuerzo_fuera_del_horario():
    with pytest.raises(ValidationError):
        _agenda(almuerzo_inicio=time(7, 0), almuerzo_fin=time(8, 30))


def test_dias_habilitados_se_validan_y_normalizan():
    assert normalizar_dias("4, 0,2,2") == "0,2,4"
    for invalido in ("", "a", "7", "1,,2", "0;1"):
        with pytest.raises(ValueError):
            normalizar_dias(invalido)
    with pytest.raises(ValidationError):
        AgendaUpdate(dias_habilitados="lunes")


def test_validar_horario_acepta_agenda_nocturna():
    validar_horario(time(20, 0), time(23, 45), None, None, 30)  # no lanza


# ---------------------------------------------------------------------------------------
# Bloqueos, sesiones, configuración
# ---------------------------------------------------------------------------------------

def test_bloqueo_de_dia_descarta_horas_y_rango_las_exige():
    b = BloqueoCreate(tipo="dia", fecha=date(2030, 1, 7), hora_inicio=time(8), hora_fin=time(9))
    assert b.hora_inicio is None and b.hora_fin is None
    with pytest.raises(ValidationError):
        BloqueoCreate(tipo="rango", fecha=date(2030, 1, 7))
    with pytest.raises(ValidationError):
        BloqueoCreate(tipo="otro", fecha=date(2030, 1, 7))


def test_sesion_exige_hora_fin_posterior():
    with pytest.raises(ValidationError):
        SesionCreate(fecha=date(2030, 1, 7), hora_inicio=time(10), hora_fin=time(9))
    with pytest.raises(ValidationError):
        SesionCreate(fecha=date(2030, 1, 7), hora_inicio=time(10), hora_fin=time(11), cupo_maximo=0)


def test_generar_lote_limita_rango_y_dias():
    base = dict(hora_inicio=time(10), hora_fin=time(11))
    with pytest.raises(ValidationError):
        GenerarSesionesIn(fecha_inicio=date(2030, 1, 10), fecha_fin=date(2030, 1, 1), dias_semana=[0], **base)
    with pytest.raises(ValidationError):
        GenerarSesionesIn(fecha_inicio=date(2030, 1, 1), fecha_fin=date(2032, 1, 1), dias_semana=[0], **base)
    with pytest.raises(ValidationError):
        GenerarSesionesIn(fecha_inicio=date(2030, 1, 1), fecha_fin=date(2030, 2, 1), dias_semana=[7], **base)
    ok = GenerarSesionesIn(fecha_inicio=date(2030, 1, 1), fecha_fin=date(2030, 2, 1), dias_semana=[3, 1, 1], **base)
    assert ok.dias_semana == [1, 3]


@pytest.mark.parametrize("clave,valor", [
    ("color_primario", "rojo"),
    ("color_primario", "#12345"),
    ("cancelacion_horas_minimas", "dos"),
    ("cancelacion_horas_minimas", "-1"),
    ("cancelacion_horas_minimas", "9999"),
    ("logo_url", "javascript:alert(1)"),
    ("contacto_correo", "no-es-correo"),
])
def test_configuracion_rechaza_valores_invalidos(clave, valor):
    with pytest.raises(DomainError):
        validar_valor_configuracion(clave, valor)


def test_configuracion_normaliza_valores_validos():
    assert validar_valor_configuracion("color_primario", " #1F3A5F ") == "#1F3A5F"
    assert validar_valor_configuracion("cancelacion_horas_minimas", "024") == "24"
    assert validar_valor_configuracion("logo_url", "/api/uploads/logo.png") == "/api/uploads/logo.png"
    assert validar_valor_configuracion("mensaje_bienvenida", "   ") is None


# ---------------------------------------------------------------------------------------
# Actividades: formulario, ventana y estados
# ---------------------------------------------------------------------------------------

VIGENCIA = dict(vigencia_inicio=date(2030, 1, 1), vigencia_fin=date(2030, 1, 31))


def test_formulario_de_seleccion_exige_opciones_y_claves_unicas():
    with pytest.raises(ValidationError):
        CampoFormulario(clave="talla", etiqueta="Talla", tipo="seleccion", opciones=[])
    ActividadCreate(nombre="X", area_id=1, **VIGENCIA)  # válida
    with pytest.raises(ValidationError):
        ActividadCreate(nombre="X", area_id=1, **VIGENCIA, campos_formulario=[
            CampoFormulario(clave="a", etiqueta="A", tipo="texto"),
            CampoFormulario(clave="a", etiqueta="B", tipo="texto"),
        ])


def test_actividad_exige_vigencia_coherente():
    with pytest.raises(ValidationError):
        ActividadCreate(nombre="X", area_id=1)  # sin vigencia
    with pytest.raises(ValidationError):
        ActividadCreate(nombre="X", area_id=1, vigencia_inicio=date(2030, 1, 2), vigencia_fin=date(2030, 1, 1))
    with pytest.raises(ValidationError):
        ActividadCreate(nombre="X", area_id=1, vigencia_inicio=date(2030, 1, 1), vigencia_fin=date(2033, 1, 1))
    # Por defecto una actividad no tiene límite de participación.
    act = ActividadCreate(nombre="X", area_id=1, **VIGENCIA)
    assert act.limite_participaciones is None and act.periodo_limite == "evento"


def test_formulario_guardado_ilegible_se_omite_pregunta_por_pregunta():
    actividad = SimpleNamespace(campos_formulario=(
        '[{"clave":"talla","etiqueta":"Talla","tipo":"seleccion","opciones":[]},'
        '{"clave":"edad","etiqueta":"Edad","tipo":"numero"}]'
    ))
    campos = actividad_service.campos_formulario_de(actividad)
    assert [c.clave for c in campos] == ["edad"]


def _actividad(**cambios):
    base = dict(activo=True, inscripcion_abierta=True, vigencia_inicio=None, vigencia_fin=None,
                publicacion_en=None, hora_apertura=None, hora_cierre=None,
                area=SimpleNamespace(activo=True))
    return SimpleNamespace(**{**base, **cambios})


def _sesion(id_, dias=3, cupo=None, activa=True):
    fecha = date.today() + timedelta(days=dias)
    return SimpleNamespace(id=id_, fecha=fecha, hora_inicio=time(10), hora_fin=time(11),
                           cupo_maximo=cupo, activa=activa, lugar=None)


@pytest.fixture
def ahora_fijo(monkeypatch):
    fijo = datetime.now(TZ).replace(hour=12, minute=0, second=0, microsecond=0)
    monkeypatch.setattr(actividad_service, "now", lambda: fijo)
    return fijo


def test_estado_actividad(ahora_fijo):
    s1, s2 = _sesion(1, cupo=2), _sesion(2, dias=5, cupo=1)
    evaluar = actividad_service.evaluar_actividad

    assert evaluar(_actividad(), [], {})[0] == "finalizada"
    estado, resumen = evaluar(_actividad(), [s1, s2], {1: 1})
    assert estado == "abierta"
    assert resumen.cupos_disponibles == 2 and resumen.inscritos_futuros == 1
    # Cupo alcanzado en todas las sesiones futuras: las inscripciones se cierran solas.
    assert evaluar(_actividad(), [s1, s2], {1: 2, 2: 1})[0] == "agotada"
    assert evaluar(_actividad(inscripcion_abierta=False), [s1], {})[0] == "cerrada"
    hoy = ahora_fijo.date()
    # Vigencia: antes del inicio "próximamente"; después del fin "finalizada", aunque queden
    # sesiones futuras (se realizan con quienes ya estaban inscritos).
    proxima = _actividad(vigencia_inicio=hoy + timedelta(days=1), vigencia_fin=hoy + timedelta(days=9))
    assert evaluar(proxima, [s1], {})[0] == "proximamente"
    terminada = _actividad(vigencia_inicio=hoy - timedelta(days=9), vigencia_fin=hoy - timedelta(days=1))
    estado, resumen = evaluar(terminada, [s1], {1: 1})
    assert estado == "finalizada" and resumen.inscritos_futuros == 1
    # El último día de la vigencia todavía recibe inscripciones.
    assert evaluar(_actividad(vigencia_inicio=hoy - timedelta(days=3), vigencia_fin=hoy), [s1], {})[0] == "abierta"
    # Sesión sin límite: nunca se agota y el total de cupos es "sin límite".
    estado, resumen = evaluar(_actividad(), [_sesion(3)], {3: 500})
    assert estado == "abierta" and resumen.cupos_disponibles is None


def test_estado_sesion():
    estado = actividad_service.estado_sesion
    assert estado(_sesion(1, cupo=2), 2, "abierta") == "cupo_lleno"
    assert estado(_sesion(1, cupo=2), 1, "abierta") == "disponible"
    assert estado(_sesion(1, cupo=2), 1, "cerrada") == "cerrada"
    assert estado(_sesion(1, activa=False), 0, "abierta") == "inactiva"
    assert estado(_sesion(1, dias=-1), 0, "abierta") == "finalizada"


def test_area_inactiva_cierra_inscripciones(ahora_fijo):
    s1 = _sesion(1, cupo=5)
    inactiva = _actividad(area=SimpleNamespace(activo=False))
    assert actividad_service.actividad_disponible(inactiva) is False
    assert actividad_service.evaluar_actividad(inactiva, [s1], {})[0] == "cerrada"
    # Actividades anteriores a la migración 0011 (sin área) dependen solo de su estado.
    assert actividad_service.actividad_disponible(_actividad(area=None)) is True


# ---------------------------------------------------------------------------------------
# Días reservables de un evento (fuente única del calendario de su detalle)
# ---------------------------------------------------------------------------------------

def test_fechas_reservables_dentro_de_la_vigencia():
    from app.services.horario_service import calcular_fechas_reservables
    lunes = date(2030, 1, 7)
    viernes = date(2030, 1, 11)
    # Antes de la vigencia: todo el periodo (el evento igual no se publica hasta el inicio).
    assert calcular_fechas_reservables(date(2030, 1, 1), lunes, viernes) == [lunes + timedelta(days=i) for i in range(5)]
    # A mitad de la vigencia: desde hoy.
    assert calcular_fechas_reservables(date(2030, 1, 9), lunes, viernes) == [date(2030, 1, 9), date(2030, 1, 10), viernes]
    # El último día de la vigencia todavía se ofrece; al día siguiente ya no.
    assert calcular_fechas_reservables(viernes, lunes, viernes) == [viernes]
    assert calcular_fechas_reservables(date(2030, 1, 12), lunes, viernes) == []
    # Tope de 31 días a la vista aunque la vigencia sea más larga.
    assert len(calcular_fechas_reservables(lunes, lunes, lunes + timedelta(days=60))) == 31


def test_fechas_reservables_sin_vigencia_o_con_una_sola_fecha():
    from app.services.horario_service import calcular_fechas_reservables
    miercoles = date(2030, 1, 9)
    # Eventos antiguos sin vigencia: días hábiles que quedan de la semana (o la siguiente).
    assert calcular_fechas_reservables(miercoles, None, None) == [miercoles, date(2030, 1, 10), date(2030, 1, 11)]
    sabado = date(2030, 1, 12)
    assert calcular_fechas_reservables(sabado, None, None) == [date(2030, 1, 14) + timedelta(days=i) for i in range(5)]
    # Solo inicio: desde hoy, 31 días. Solo fin: desde hoy hasta el fin.
    solo_inicio = calcular_fechas_reservables(miercoles, date(2030, 1, 1), None)
    assert solo_inicio[0] == miercoles and len(solo_inicio) == 31
    assert calcular_fechas_reservables(miercoles, None, date(2030, 1, 10)) == [miercoles, date(2030, 1, 10)]


# ---------------------------------------------------------------------------------------
# Cálculo puro de turnos (lo usan la disponibilidad de un día y el resumen del catálogo)
# ---------------------------------------------------------------------------------------

def _agenda_demo(**cambios):
    base = dict(hora_inicio=time(8), hora_fin=time(10), duracion_minutos=30, almuerzo_inicio=None,
                almuerzo_fin=None, dias=[0, 1, 2, 3, 4, 5, 6])
    return SimpleNamespace(**{**base, **cambios})


def _estados(slots):
    return {s.hora_inicio.strftime("%H:%M"): s.estado.value for s in slots}


def test_calcular_slots_aplica_bloqueos_ocupacion_y_pasado():
    from app.services.horario_service import calcular_slots
    fecha = date(2030, 1, 7)
    ahora = datetime(2030, 1, 7, 8, 40, tzinfo=TZ)
    rango = SimpleNamespace(tipo="rango", hora_inicio=time(9, 30), hora_fin=time(10), agenda_id=None)
    slots = calcular_slots(
        _agenda_demo(), fecha, bloqueos=[rango], es_festivo=False,
        ocupados=[(time(9, 10), time(9, 40))],  # reserva fuera de la grilla: se cruza con 09:00 y 09:30
        ahora=ahora,
    )
    assert _estados(slots) == {"08:00": "pasado", "08:30": "pasado", "09:00": "ocupado", "09:30": "bloqueado"}


def test_calcular_slots_dia_bloqueado_vacio_en_portal_y_visible_para_admin():
    from app.services.horario_service import calcular_slots
    fecha = date(2030, 1, 7)
    ahora = datetime(2030, 1, 1, 8, 0, tzinfo=TZ)
    assert calcular_slots(_agenda_demo(), fecha, bloqueos=[], es_festivo=True, ocupados=[], ahora=ahora) == []
    admin = calcular_slots(_agenda_demo(), fecha, bloqueos=[], es_festivo=True, ocupados=[], ahora=ahora, incluir_pasado=True)
    assert {s.estado.value for s in admin} == {"bloqueado"}
    # Día no habilitado en la agenda: sin turnos.
    assert calcular_slots(_agenda_demo(dias=[1]), fecha, bloqueos=[], es_festivo=False, ocupados=[], ahora=ahora) == []
