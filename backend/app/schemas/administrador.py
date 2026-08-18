from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models.rol import ROL_ADMINISTRADOR


class AdministradorOut(BaseModel):
    id: int
    usuario: str
    nombre: str
    rol: str
    activo: bool
    created_at: datetime


class AdministradorCreate(BaseModel):
    usuario: str = Field(min_length=3, max_length=80)
    nombre: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=8, max_length=72)
    rol: Literal["administrador", "visor_reservas"] = ROL_ADMINISTRADOR
