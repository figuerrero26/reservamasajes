"""Vigencia de un evento y límites de participación por persona (funciones puras).

Vigencia: cada evento (de reserva por turnos o actividad con inscripción) tiene su propio
periodo [inicio, fin], ambos días incluidos:
- "proximo": todavía no empieza → no aparece en el portal ni recibe participaciones.
- "vigente": aparece y recibe reservas/inscripciones.
- "finalizado": terminó → deja de aparecer y de recibir participaciones, pero TODO su
  historial (reservas, inscripciones, notificaciones) se conserva intacto.
- "sin_vigencia": eventos creados antes de que existiera la vigencia (sin límite de fechas).

El estado se calcula siempre contra la fecha actual de la aplicación (America/Bogota) en
cada solicitud: el cierre ocurre a la medianoche del día siguiente al fin aunque nadie entre
al panel y aunque la tarea programada no haya corrido todavía.
"""
from datetime import date, timedelta
from typing import Literal

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
        return f"Este evento finalizó el {formato_fecha(fin)} y ya no recibe {que}."
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
