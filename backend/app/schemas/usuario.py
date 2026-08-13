from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class UsuarioOut(BaseModel):
    """Vista administrativa del colaborador (uso interno, nunca expuesta al portal público).
    Solo lo mínimo: identidad, correo, estado de la cuenta y campos técnicos."""
    model_config = ConfigDict(from_attributes=True)
    id: int
    nombre: str
    apellido: str
    correo: str | None = None
    tiene_cuenta: bool
    activo: bool
    permite_reservas_multiples: bool
    created_at: datetime
    updated_at: datetime


class UsuarioPasswordSet(BaseModel):
    """Restablecimiento de contraseña por un administrador."""
    password_nueva: str = Field(min_length=8, max_length=72)
