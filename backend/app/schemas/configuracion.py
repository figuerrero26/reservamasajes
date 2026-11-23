from pydantic import BaseModel, Field


class ConfiguracionValor(BaseModel):
    clave: str = Field(min_length=1, max_length=80)
    valor: str | None = Field(default=None, max_length=20000)


class ConfiguracionGeneralOut(BaseModel):
    """Configuración pública que necesita el portal (branding, contacto y textos legales,
    sin datos sensibles)."""
    empresa_nombre: str | None = None
    sistema_nombre: str | None = None
    logo_url: str | None = None
    color_primario: str | None = None
    color_secundario: str | None = None
    mensaje_bienvenida: str | None = None
    imagen_bienvenida_url: str | None = None
    color_boton_disponibilidad: str | None = None
    color_fondo_bienvenida: str | None = None
    contacto_correo: str | None = None
    contacto_telefono: str | None = None
    contacto_direccion: str | None = None
    terminos_condiciones: str | None = None
    zona_horaria: str


class PlantillaCorreoOut(BaseModel):
    """Plantilla efectiva del correo de confirmación de reserva: si el admin no la ha
    personalizado, trae los valores por defecto (nunca vacía)."""
    asunto: str
    cuerpo: str
    imagen_url: str | None = None
    placeholders: list[str]


class VistaPreviaCorreoIn(BaseModel):
    cuerpo: str = Field(max_length=5000)


class VistaPreviaCorreoOut(BaseModel):
    html: str
