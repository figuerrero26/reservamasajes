from pydantic import BaseModel, EmailStr, Field


class RegistroRequest(BaseModel):
    """Registro público: solo nombre, apellido, correo y contraseña. Sin cédula."""
    nombre: str = Field(min_length=1, max_length=120)
    apellido: str = Field(min_length=1, max_length=120)
    correo: EmailStr
    password: str = Field(min_length=8, max_length=72)


class LoginUsuarioRequest(BaseModel):
    correo: EmailStr
    password: str


class TokenUsuarioResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    nombre: str
    apellido: str
    correo: str


class PerfilUsuarioOut(BaseModel):
    id: int
    nombre: str
    apellido: str
    correo: str
    permite_reservas_multiples: bool


class OlvidePasswordRequest(BaseModel):
    correo: EmailStr


class RestablecerPasswordRequest(BaseModel):
    token: str
    password_nueva: str = Field(min_length=8, max_length=72)
