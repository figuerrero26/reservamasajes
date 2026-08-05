from pydantic import BaseModel, ConfigDict, Field


class ServicioBase(BaseModel):
    nombre: str = Field(min_length=1, max_length=120)
    descripcion: str | None = None
    activo: bool = True


class ServicioCreate(ServicioBase):
    pass


class ServicioUpdate(BaseModel):
    nombre: str | None = None
    descripcion: str | None = None
    activo: bool | None = None


class ServicioOut(ServicioBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
