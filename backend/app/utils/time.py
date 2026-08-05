"""Utilidades de tiempo ancladas a la zona horaria de la aplicación."""
from datetime import datetime, date, time, timedelta
from zoneinfo import ZoneInfo

from app.config import settings

TZ = ZoneInfo(settings.TIMEZONE)


def now() -> datetime:
    """Fecha y hora actual en la zona horaria oficial (America/Bogota)."""
    return datetime.now(TZ)


def today() -> date:
    return now().date()


def add_minutes(t: time, minutes: int) -> time:
    """Suma minutos a un objeto time (sin desbordar de día para uso en agenda)."""
    base = datetime(2000, 1, 1, t.hour, t.minute, t.second)
    return (base + timedelta(minutes=minutes)).time()


def overlaps(a_start: time, a_end: time, b_start: time, b_end: time) -> bool:
    """Indica si el rango [a_start, a_end) se solapa con [b_start, b_end)."""
    return a_start < b_end and b_start < a_end
