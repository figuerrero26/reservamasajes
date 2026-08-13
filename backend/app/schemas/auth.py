from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    usuario: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    rol: str
    nombre: str


class CambiarPasswordRequest(BaseModel):
    password_actual: str
    password_nueva: str = Field(min_length=8, max_length=72)


class ResetPasswordRequest(BaseModel):
    """Restablecimiento de contraseña ejecutado por otro administrador o por el script de soporte."""
    usuario: str
    password_nueva: str = Field(min_length=8, max_length=72)
