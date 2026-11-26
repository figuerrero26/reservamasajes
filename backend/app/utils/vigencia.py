"""Vigencia de un evento y límites de participación por persona (funciones puras).

Vigencia por días: cada evento (de reserva por turnos o actividad con inscripción) tiene su propio
periodo [inicio, fin], ambos días incluidos:
- "proximo": todavía no recibe participaciones.
- "vigente": recibe reservas o inscripciones.
- "finalizado": dejó de recibir participaciones y conserva su historial.
- "sin_vigencia": eventos creados antes de que existiera la vigencia (sin límite de fechas).

La programación opcional añade una fecha de publicación y horas de apertura y cierre.
La zona horaria de la aplicación se aplica en cada solicitud.
"""
from datetime import date, datetime, time, timedelta
from typing import Literal, Protocol

EstadoVigencia = Literal["sin_vigencia", "proximo", "vigente", "finalizado"]
Periodo = Literal["evento", "dia", "semana", "mes"]
PERIODOS: tuple[str, ...] = ("evento", "dia", "semana", "mes")


def estado_vigencia(inicio: date | None, fin: date | None, hoy: date) -> EstadoVigencia:
    if inicio is None and fin is None:
        return "sin_vigencia"
    if inicio is not None and hoy < inicio:
        return "proximo"
    if fin is not None and hoy > fin:
        return "finalizado"
    return "vigente"


def acepta_participaciones(inicio: date | None, fin: date | None, hoy: date) -> bool:
    return estado_vigencia(inicio, fin, hoy) in ("vigente", "sin_vigencia")


def fecha_en_vigencia(inicio: date | None, fin: date | None, fecha: date) -> bool:
    return (inicio is None or fecha >= inicio) and (fin is None or fecha <= fin)


_MESES = (
    "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
    "septiembre", "octubre", "noviembre", "diciembre",
)


def formato_fecha(fecha: date) -> str:
    """"30 de noviembre de 2026" (sin depender del locale del servidor)."""
    return f"{fecha.day} de {_MESES[fecha.month - 1]} de {fecha.year}"


def motivo_fuera_de_vigencia(
    inicio: date | None, fin: date | None, hoy: date, que: str = "reservas",
) -> str | None:
    """None si el evento está en su vigencia (o no tiene); si no, el motivo legible."""
    estado = estado_vigencia(inicio, fin, hoy)
    if estado == "proximo" and inicio is not None:
        return f"Este evento abre sus {que} el {formato_fecha(inicio)}."
    if estado == "finalizado" and fin is not None:
        return f"El periodo de {que} finalizó el {formato_fecha(fin)}."
    return None


class EventoProgramado(Protocol):
    vigencia_inicio: date | None
    vigencia_fin: date | None
    publicacion_en: datetime | None
    hora_apertura: time | None
    hora_cierre: time | None


def _apertura_participacion(evento: EventoProgramado) -> datetime | None:
    apertura = getattr(evento, "apertura_reservas_en", None)
    if apertura is not None:
        return apertura
    if evento.vigencia_inicio is not None:
        return datetime.combine(evento.vigencia_inicio, evento.hora_apertura or time.min)
    return None


def estado_participacion(evento: EventoProgramado, ahora: datetime) -> EstadoVigencia:
    fin = evento.vigencia_fin
    apertura = _apertura_participacion(evento)
    local = ahora.replace(tzinfo=None)
    if fin is not None and (local.date() > fin or (
        local.date() == fin and evento.hora_cierre is not None and local.time() >= evento.hora_cierre
    )):
        return "finalizado"
    if apertura is not None and local < apertura:
        return "proximo"
    return "vigente" if apertura is not None or fin is not None else "sin_vigencia"


def proximo_cambio_participacion(evento: EventoProgramado, ahora: datetime) -> datetime | None:
    estado = estado_participacion(evento, ahora)
    if estado == "proximo":
        apertura = _apertura_participacion(evento)
        if apertura is not None:
            return apertura.replace(tzinfo=ahora.tzinfo)
    if estado == "vigente" and evento.vigencia_fin is not None:
        fin, cierre = evento.vigencia_fin, evento.hora_cierre
        if cierre is None:
            if fin == date.max:
                return None
            fin, cierre = fin + timedelta(days=1), time.min
        return datetime.combine(fin, cierre, tzinfo=ahora.tzinfo)
    return None


def publicado(evento: EventoProgramado, ahora: datetime) -> bool:
    """Un evento activo se publica de inmediato salvo que se programe para más adelante."""
    return evento.publicacion_en is None or ahora.replace(tzinfo=None) >= evento.publicacion_en


def motivo_participacion(evento: EventoProgramado, ahora: datetime, que: str) -> str | None:
    if not publicado(evento, ahora):
        return "Este evento aún no se ha publicado."
    estado = estado_participacion(evento, ahora)
    if estado == "proximo":
        apertura = _apertura_participacion(evento)
        if apertura is not None and getattr(evento, "apertura_reservas_en", None) is not None:
            formato = "%H:%M:%S" if apertura.second else "%H:%M"
            return f"Las reservas estarán habilitadas a partir del {formato_fecha(apertura.date())} a las {apertura.strftime(formato)}."
        fecha = formato_fecha(evento.vigencia_inicio)
        hora = ""
        if evento.hora_apertura is not None:
            formato = "%H:%M:%S" if evento.hora_apertura.second else "%H:%M"
            hora = f" a las {evento.hora_apertura.strftime(formato)}"
        return f"Este evento abre sus {que} el {fecha}{hora}."
    if estado == "finalizado":
        return motivo_fuera_de_vigencia(evento.vigencia_inicio, evento.vigencia_fin, ahora.date(), que) or (
            f"Este evento ya cerró sus {que}."
        )
    return None


def ventana_limite(fecha: date, periodo: str, inicio_vigencia: date | None = None) -> tuple[date | None, date | None]:
    """Fechas (incluidas; None = sin tope) dentro de las cuales se cuentan las
    participaciones previas de una persona al validar un límite para una participación en
    `fecha`.

    "evento" = toda la vigencia actual del evento: desde su inicio, sin tope final (una
    actividad puede tener sesiones posteriores al cierre de inscripciones, y también
    cuentan). Así, si el administrador vuelve a programar el mismo evento con una vigencia
    nueva, el historial de periodos anteriores no bloquea a nadie."""
    if periodo == "evento":
        return inicio_vigencia, None
    if periodo == "dia":
        return fecha, fecha
    if periodo == "semana":
        lunes = fecha - timedelta(days=fecha.weekday())
        return lunes, lunes + timedelta(days=6)
    if periodo == "mes":
        inicio = fecha.replace(day=1)
        siguiente = (inicio + timedelta(days=32)).replace(day=1)
        return inicio, siguiente - timedelta(days=1)
    return None, None


Tipo = Literal["reserva", "inscripción"]

_ALCANCE = {
    "evento": "durante toda la vigencia del evento",
    "dia": "por día",
    "semana": "por semana",
    "mes": "por mes",
}


def describir_regla(limite: int | None, periodo: str, tipo: Tipo) -> str:
    """Regla de participación en palabras, para el portal y el panel (una sola redacción)."""
    plural = "reservas" if tipo == "reserva" else "inscripciones"
    if limite is None:
        return f"Sin límite de {plural} por persona."
    alcance = _ALCANCE.get(periodo, _ALCANCE["evento"])
    if limite == 1:
        if periodo == "evento":
            return f"Una sola {tipo} por persona durante toda la vigencia del evento."
        if periodo == "dia":
            return f"Una {tipo} por persona por día; puedes repetir en días diferentes."
        return f"Una {tipo} por persona {alcance}."
    return f"Hasta {limite} {plural} por persona {alcance}."


def rango_vigencia_texto(inicio: date | None, fin: date | None) -> str:
    if inicio and fin:
        return f"del {formato_fecha(inicio)} al {formato_fecha(fin)}"
    if inicio:
        return f"a partir del {formato_fecha(inicio)}"
    if fin:
        return f"hasta el {formato_fecha(fin)}"
    return "sin límite de fechas"


def desde_para_limite(fecha: date, periodo: str, inicio_vigencia: date | None) -> date | None:
    """Fecha mínima del historial que hace falta consultar para evaluar un límite (la
    ventana de cualquier periodo contiene el propio día de la participación)."""
    return ventana_limite(fecha, periodo, inicio_vigencia)[0]


def motivo_limite(
    fechas_previas: list[date], fecha: date, limite: int | None, periodo: str,
    inicio_vigencia: date | None, tipo: Tipo,
) -> str | None:
    """None si una participación nueva en `fecha` respeta el límite del evento; si no, el
    motivo. `fechas_previas`: fechas de las participaciones NO canceladas de la persona."""
    if limite is None:
        return None
    desde, hasta = ventana_limite(fecha, periodo, inicio_vigencia)
    previas = sum(1 for f in fechas_previas if (desde is None or f >= desde) and (hasta is None or f <= hasta))
    return mensaje_limite(limite, periodo, tipo) if previas >= limite else None


def para_administrador(motivo: str) -> str:
    """El mismo motivo redactado para el panel (reserva o inscripción manual del admin)."""
    for persona, tercera in (("Ya tienes", "El colaborador ya tiene"), ("Ya alcanzaste", "El colaborador ya alcanzó")):
        if motivo.startswith(persona):
            return tercera + motivo[len(persona):]
    return motivo


def mensaje_limite(limite: int, periodo: str, tipo: Tipo) -> str:
    """Motivo legible cuando una persona ya alcanzó el límite de participaciones."""
    if limite == 1:
        if periodo == "evento":
            return f"Ya tienes una {tipo} en este evento: solo se permite una por persona durante su vigencia."
        cuando = {"dia": " para ese día", "semana": " esa semana", "mes": " ese mes"}.get(periodo, "")
        return f"Ya tienes una {tipo} en este evento{cuando}."
    plural = "reservas" if tipo == "reserva" else "inscripciones"
    alcance = {
        "evento": "en este evento durante su vigencia",
        "dia": "en este evento para ese día",
        "semana": "en este evento esa semana",
        "mes": "en este evento ese mes",
    }.get(periodo, "en este evento")
    return f"Ya alcanzaste el máximo de {limite} {plural} {alcance}."
