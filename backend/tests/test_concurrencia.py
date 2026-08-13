"""Pruebas obligatorias de concurrencia contra MariaDB real: dos intentos simultáneos deben
resolver en exactamente un éxito, protegidos por los índices únicos de la tabla `reservas`
(no solo por la validación de la aplicación).
"""
import threading
from datetime import date, time, timedelta

from app.database.session import SessionLocal
from app.models import Usuario
from app.services.errors import Conflict
from app.services.reserva_service import ReservaService


def _lunes_futuro() -> date:
    d = date.today() + timedelta(days=14)
    return d - timedelta(days=d.weekday())


def _correr_en_paralelo(intentos: list[dict]) -> dict:
    """Ejecuta cada intento (dict con agenda_id/fecha/hora/usuario_id) en su propio hilo y
    sesión, sincronizados con una barrera para maximizar la ventana de carrera real en la BD.
    Devuelve {clave: ("ok", id) | ("conflicto", msg) | ("error", repr)}."""
    barrera = threading.Barrier(len(intentos))
    resultados: dict[str, object] = {}

    def intentar(clave: str, agenda_id: int, fecha: date, hora: time, usuario_id: int):
        session = SessionLocal()
        try:
            barrera.wait(timeout=5)
            reserva = ReservaService(session).crear(
                agenda_id=agenda_id, fecha=fecha, hora_inicio=hora, usuario_id=usuario_id,
            )
            resultados[clave] = ("ok", reserva.id)
        except Conflict as exc:
            resultados[clave] = ("conflicto", str(exc))
        except Exception as exc:  # cualquier otro error también se reporta, no se traga
            resultados[clave] = ("error", repr(exc))
        finally:
            session.close()

    hilos = [
        threading.Thread(target=intentar, args=(i["clave"], i["agenda_id"], i["fecha"], i["hora"], i["usuario_id"]))
        for i in intentos
    ]
    for h in hilos:
        h.start()
    for h in hilos:
        h.join(timeout=10)
    return resultados


def test_dos_usuarios_simultaneos_mismo_slot_solo_uno_reserva(datos_base):
    db_setup = SessionLocal()
    uno = Usuario(nombre="Concurrente", apellido="Uno")
    dos = Usuario(nombre="Concurrente", apellido="Dos")
    db_setup.add_all([uno, dos])
    db_setup.commit()
    id_uno, id_dos = uno.id, dos.id
    db_setup.close()

    lunes = _lunes_futuro()
    hora = time(9, 0)

    resultados = _correr_en_paralelo([
        {"clave": "uno", "agenda_id": datos_base["agenda_id"], "fecha": lunes, "hora": hora, "usuario_id": id_uno},
        {"clave": "dos", "agenda_id": datos_base["agenda_id"], "fecha": lunes, "hora": hora, "usuario_id": id_dos},
    ])

    estados = [resultados["uno"][0], resultados["dos"][0]]
    assert estados.count("ok") == 1, f"debía haber exactamente 1 éxito, se obtuvo: {resultados}"
    assert estados.count("conflicto") == 1, f"debía haber exactamente 1 conflicto 409, se obtuvo: {resultados}"

    verificacion = SessionLocal()
    try:
        from app.models import EstadoReserva, Reserva
        activas = verificacion.query(Reserva).filter(
            Reserva.agenda_id == datos_base["agenda_id"],
            Reserva.fecha == lunes,
            Reserva.hora_inicio == hora,
            Reserva.estado == EstadoReserva.ACTIVA.value,
        ).all()
        assert len(activas) == 1
    finally:
        verificacion.close()


def test_mismo_usuario_mismo_evento_dos_horarios_simultaneos_solo_uno_reserva(datos_base):
    """La regla "una reserva por usuario+evento+día" también debe resistir una carrera real:
    el mismo usuario intentando el mismo evento a dos horas distintas del mismo día al mismo
    tiempo — la última barrera es el índice único, no solo el chequeo previo en memoria."""
    db_setup = SessionLocal()
    usuario = Usuario(nombre="Carrera", apellido="EventoDia")
    db_setup.add(usuario)
    db_setup.commit()
    usuario_id = usuario.id
    db_setup.close()

    lunes = _lunes_futuro()

    resultados = _correr_en_paralelo([
        {"clave": "temprano", "agenda_id": datos_base["agenda_id"], "fecha": lunes,
         "hora": time(9, 0), "usuario_id": usuario_id},
        {"clave": "tarde", "agenda_id": datos_base["agenda_id"], "fecha": lunes,
         "hora": time(15, 0), "usuario_id": usuario_id},
    ])

    estados = [resultados["temprano"][0], resultados["tarde"][0]]
    assert estados.count("ok") == 1, f"debía haber exactamente 1 éxito, se obtuvo: {resultados}"
    assert estados.count("conflicto") == 1, f"debía haber exactamente 1 conflicto 409, se obtuvo: {resultados}"

    verificacion = SessionLocal()
    try:
        from app.models import EstadoReserva, Reserva
        activas = verificacion.query(Reserva).filter(
            Reserva.usuario_id == usuario_id,
            Reserva.servicio_id == datos_base["servicio_id"],
            Reserva.fecha == lunes,
            Reserva.estado == EstadoReserva.ACTIVA.value,
        ).all()
        assert len(activas) == 1
    finally:
        verificacion.close()
