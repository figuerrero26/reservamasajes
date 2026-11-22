from datetime import date

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.reserva import ReservaAdminOut


class FestivoBase(BaseModel):
    fecha: date
    nombre: str = Field(min_length=1, max_length=160)
    descripcion: str | None = Field(default=None, max_length=255)
    estado: bool = True


class FestivoCreate(FestivoBase):
    pass


class FestivoUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=1, max_length=160)
    descripcion: str | None = Field(default=None, max_length=255)
    estado: bool | None = None


class FestivoOut(FestivoBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


class FestivoGuardadoOut(FestivoOut):
    """Reservas futuras del día festivo (solo si está activo). No se cancelan solas."""
    reservas_afectadas: list[ReservaAdminOut] = []
