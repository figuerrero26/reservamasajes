from pydantic import BaseModel, ConfigDict, Field


class AreaBase(BaseModel):
    nombre: str = Field(min_length=1, max_length=120)
    descripcion: str | None = None
    activo: bool = True


class AreaCreate(AreaBase):
    pass


class AreaUpdate(BaseModel):
    nombre: str | None = None
    descripcion: str | None = None
    activo: bool | None = None


class AreaOut(AreaBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
