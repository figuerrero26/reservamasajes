from pydantic import BaseModel


class AgendaResumen(BaseModel):
    """Referencia mínima para el sub-selector de área/agenda de un evento."""
    id: int
    area_id: int
    area_nombre: str


class EventoPublico(BaseModel):
    """Tarjeta pública: no expone nada administrativo, solo lo necesario para mostrarla
    y navegar a la disponibilidad."""
    id: int
    nombre: str
    descripcion_corta: str | None = None
    descripcion_larga: str | None = None
    imagen_url: str | None = None
    duracion_minutos: int
    informacion_adicional: str | None = None
    areas: list[str]
    agendas: list[AgendaResumen]
