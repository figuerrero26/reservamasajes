from pydantic import BaseModel, EmailStr, Field


class SmtpConfigOut(BaseModel):
    """Nunca incluye la contraseña. `password_configurada` solo indica si hay una guardada."""
    host: str | None = None
    port: int | None = None
    usuario: str | None = None
    password_configurada: bool = False
    tls: bool = True
    from_email: str | None = None
    from_nombre: str | None = None


class SmtpConfigUpdate(BaseModel):
    host: str = Field(min_length=1, max_length=255)
    port: int = Field(ge=1, le=65535)
    usuario: str | None = None
    password: str | None = None  # None = no cambiar la ya guardada
    tls: bool = True
    from_email: EmailStr
    from_nombre: str = Field(min_length=1, max_length=160)


class SmtpPruebaRequest(BaseModel):
    destinatario: EmailStr
