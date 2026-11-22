from pydantic import BaseModel, ConfigDict, Field

from app.schemas.reserva import ReservaAdminOut


class ServicioBase(BaseModel):
    nombre: str = Field(min_length=1, max_length=120)
    descripcion_corta: str | None = Field(default=None, max_length=255)
    descripcion_larga: str | None = None
    imagen_url: str | None = Field(default=None, max_length=500)
    duracion_minutos: int = Field(default=30, ge=5, le=480)
    informacion_adicional: str | None = None
    activo: bool = True


class ServicioCreate(ServicioBase):
    pass


class ServicioUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=1, max_length=120)
    descripcion_corta: str | None = Field(default=None, max_length=255)
    descripcion_larga: str | None = None
    imagen_url: str | None = Field(default=None, max_length=500)
    duracion_minutos: int | None = Field(default=None, ge=5, le=480)
    informacion_adicional: str | None = None
    activo: bool | None = None


class ServicioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    nombre: str
    descripcion_corta: str | None = None
    descripcion_larga: str | None = None
    imagen_url: str | None = None
    duracion_minutos: int
    informacion_adicional: str | None = None
    activo: bool


class ServicioEstadoOut(ServicioOut):
    """Al desactivar: reservas futuras que siguen vigentes (no se cancelan solas)."""
    reservas_afectadas: list[ReservaAdminOut] = []
