from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class FestivoBase(BaseModel):
    fecha: date
    nombre: str = Field(min_length=1, max_length=160)
    descripcion: str | None = None
    estado: bool = True


class FestivoCreate(FestivoBase):
    pass


class FestivoUpdate(BaseModel):
    nombre: str | None = None
    descripcion: str | None = None
    estado: bool | None = None


class FestivoOut(FestivoBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
