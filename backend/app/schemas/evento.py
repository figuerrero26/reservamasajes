from datetime import date, time

from pydantic import BaseModel


class AgendaResumen(BaseModel):
    """Referencia mínima para el sub-selector de área/agenda de un evento."""
    id: int
    area_id: int
    area_nombre: str


class EventoPublico(BaseModel):
    """Tarjeta pública: no expone nada administrativo, solo lo necesario para mostrarla
    y navegar a la disponibilidad.

    La duración y la disponibilidad se calculan desde las agendas reservables (no desde el
    servicio): `duracion_minutos`/`duracion_maxima` son la menor y la mayor duración de
    turno entre sus áreas, y `turnos_disponibles`/`proximo_turno_*` resumen los días que el
    portal ofrece para reservar (ver HorarioService.fechas_reservables)."""
    id: int
    nombre: str
    descripcion_corta: str | None = None
    descripcion_larga: str | None = None
    imagen_url: str | None = None
    duracion_minutos: int
    duracion_maxima: int
    informacion_adicional: str | None = None
    areas: list[str]
    area_ids: list[int] = []
    agendas: list[AgendaResumen]
    turnos_disponibles: int = 0
    proximo_turno_fecha: date | None = None
    proximo_turno_hora: time | None = None
