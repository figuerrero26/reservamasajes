from pydantic import BaseModel, Field, model_validator

# La fortaleza de las contraseñas nuevas se valida en el servicio (app/auth/politica_password.py),
# con el usuario y el nombre de la cuenta: aquí solo se acota el tamaño del campo.
_MAX_CAMPO_PASSWORD = 256


class LoginRequest(BaseModel):
    usuario: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    rol: str
    nombre: str


class CambiarPasswordRequest(BaseModel):
    """Cambio de la contraseña PROPIA: exige la actual. `password_confirmacion` es opcional
    por compatibilidad; si se envía, debe coincidir."""
    password_actual: str = Field(max_length=_MAX_CAMPO_PASSWORD)
    password_nueva: str = Field(min_length=1, max_length=_MAX_CAMPO_PASSWORD)
    password_confirmacion: str | None = Field(default=None, max_length=_MAX_CAMPO_PASSWORD)

    @model_validator(mode="after")
    def _confirmacion(self):
        if self.password_confirmacion is not None and self.password_confirmacion != self.password_nueva:
            raise ValueError("La confirmación no coincide con la nueva contraseña.")
        return self


class ResetPasswordRequest(BaseModel):
    """Restablecimiento de la contraseña de OTRO administrador, identificado por su usuario
    (equivalente a POST /administradores/{id}/password)."""
    usuario: str
    password_nueva: str = Field(min_length=1, max_length=_MAX_CAMPO_PASSWORD)
