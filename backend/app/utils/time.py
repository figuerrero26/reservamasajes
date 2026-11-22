"""Utilidades de tiempo ancladas a la zona horaria de la aplicación."""
from datetime import date, datetime, time
from zoneinfo import ZoneInfo

from app.config import settings

TZ = ZoneInfo(settings.APP_TIMEZONE)


def now() -> datetime:
    """Fecha y hora actual en la zona horaria oficial (America/Bogota)."""
    return datetime.now(TZ)


def today() -> date:
    return now().date()


def a_minutos(t: time) -> int:
    """Minutos transcurridos desde la medianoche (ignora segundos)."""
    return t.hour * 60 + t.minute


def desde_minutos(minutos: int) -> time:
    """Inversa de `a_minutos`. Solo admite valores dentro del mismo día (0–1439)."""
    if not 0 <= minutos < 24 * 60:
        raise ValueError("La hora resultante queda fuera del día")
    return time(minutos // 60, minutos % 60)


def add_minutes(t: time, minutes: int) -> time:
    """Suma minutos a un objeto time SIN dar la vuelta a la medianoche: si el resultado
    pasara de las 23:59, lanza ValueError en vez de devolver una hora del día siguiente
    (que se compararía como "anterior" y rompería cualquier ciclo que dependa de ella)."""
    return desde_minutos(a_minutos(t) + minutes)


def overlaps(a_start: time, a_end: time, b_start: time, b_end: time) -> bool:
    """Indica si el rango [a_start, a_end) se solapa con [b_start, b_end)."""
    return a_start < b_end and b_start < a_end


def inicio_de(fecha: date, hora: time) -> datetime:
    """Momento (con zona horaria) en que empieza algo que ocurre en `fecha` a `hora`."""
    return datetime.combine(fecha, hora, tzinfo=TZ)


def ya_empezo(fecha: date, hora: time) -> bool:
    return inicio_de(fecha, hora) <= now()
