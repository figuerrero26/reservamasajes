from pydantic import BaseModel, ConfigDict, Field

from app.schemas.reserva import ReservaAdminOut


class AreaBase(BaseModel):
    nombre: str = Field(min_length=1, max_length=120)
    descripcion: str | None = Field(default=None, max_length=255)
    activo: bool = True


class AreaCreate(AreaBase):
    pass


class AreaUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=1, max_length=120)
    descripcion: str | None = Field(default=None, max_length=255)
    activo: bool | None = None


class AreaOut(AreaBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


class AreaEstadoOut(AreaOut):
    reservas_afectadas: list[ReservaAdminOut] = []
