from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.auth.politica_password import validar_password
from app.models.rol import ROL_ADMINISTRADOR

# Tope de caracteres del campo (la política limita además a 72 bytes, el máximo de Bcrypt).
_MAX_CAMPO_PASSWORD = 256


class AdministradorOut(BaseModel):
    """Nunca incluye la contraseña ni su hash."""
    id: int
    usuario: str
    nombre: str
    rol: str
    activo: bool
    created_at: datetime
    password_actualizada_en: datetime | None = None


class AdministradorCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    usuario: str = Field(min_length=3, max_length=80)
    nombre: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=_MAX_CAMPO_PASSWORD)
    rol: Literal["administrador", "visor_reservas"] = ROL_ADMINISTRADOR

    @model_validator(mode="after")
    def _password_segura(self):
        validar_password(self.password, self.usuario, self.nombre)
        return self


class RestablecerPasswordAdmin(BaseModel):
    """Contraseña nueva para OTRA cuenta administrativa (la propia se cambia con la actual,
    en POST /auth/cambiar-password). La fortaleza se valida en el servicio, con el usuario y
    el nombre de la cuenta destino."""
    model_config = ConfigDict(extra="forbid")
    password_nueva: str = Field(min_length=1, max_length=_MAX_CAMPO_PASSWORD)
    password_confirmacion: str = Field(min_length=1, max_length=_MAX_CAMPO_PASSWORD)

    @model_validator(mode="after")
    def _confirmacion(self):
        if self.password_nueva != self.password_confirmacion:
            raise ValueError("La confirmación no coincide con la nueva contraseña.")
        return self
