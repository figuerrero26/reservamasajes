from pydantic import BaseModel, ConfigDict, Field


class ServicioBase(BaseModel):
    nombre: str = Field(min_length=1, max_length=120)
    descripcion_corta: str | None = None
    descripcion_larga: str | None = None
    imagen_url: str | None = None
    duracion_minutos: int = Field(default=30, ge=5, le=480)
    informacion_adicional: str | None = None
    activo: bool = True


class ServicioCreate(ServicioBase):
    pass


class ServicioUpdate(BaseModel):
    nombre: str | None = None
    descripcion_corta: str | None = None
    descripcion_larga: str | None = None
    imagen_url: str | None = None
    duracion_minutos: int | None = None
    informacion_adicional: str | None = None
    activo: bool | None = None


class ServicioOut(ServicioBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
