from datetime import date, datetime, time

from pydantic import BaseModel


class AgendaResumen(BaseModel):
    """Referencia mínima para el sub-selector de área/agenda de un evento."""
    id: int
    area_id: int
    area_nombre: str


class EventoPublico(BaseModel):
    """Evento por turnos en el portal: no expone nada administrativo.

    En el CATÁLOGO (tarjetas) solo viaja la información general e identificativa del evento;
    la disponibilidad se muestra únicamente en el DETALLE, que además trae
    `dias_reservables` (días que el portal ofrece para reservar, dentro de la vigencia, ver
    HorarioService.fechas_reservables) y el resumen `turnos_disponibles`/`proximo_turno_*`.

    La duración se calcula desde las agendas reservables: `duracion_minutos`/
    `duracion_maxima` son la menor y la mayor duración de turno entre sus áreas."""
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
    vigencia_inicio: date | None = None
    vigencia_fin: date | None = None
    motivo_no_disponible: str | None = None
    proximo_cambio_en: datetime | None = None
    regla_participacion: str
    # Solo en el detalle (GET /eventos/{id}); en el catálogo quedan en null.
    dias_reservables: list[date] | None = None
    turnos_disponibles: int | None = None
    proximo_turno_fecha: date | None = None
    proximo_turno_hora: time | None = None
