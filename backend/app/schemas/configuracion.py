from datetime import date

from pydantic import BaseModel


class ConfiguracionValor(BaseModel):
    clave: str
    valor: str | None = None


class ConfiguracionGeneralOut(BaseModel):
    """Configuración pública mínima que necesita el portal (branding, sin datos sensibles)."""
    empresa_nombre: str | None = None
    sistema_nombre: str | None = None
    logo_url: str | None = None
    color_primario: str | None = None
    color_secundario: str | None = None
    mensaje_bienvenida: str | None = None
    imagen_bienvenida_url: str | None = None
    color_boton_disponibilidad: str | None = None
    color_fondo_bienvenida: str | None = None
    evento_unico_por_semana: bool = False
    zona_horaria: str
    semana_activa_inicio: date | None = None
    semana_activa_fin: date | None = None


class SemanaActivaSet(BaseModel):
    inicio: date
    fin: date


class PlantillaCorreoOut(BaseModel):
    """Plantilla efectiva del correo de confirmación de reserva: si el admin no la ha
    personalizado, trae los valores por defecto (nunca vacía)."""
    asunto: str
    cuerpo: str
    imagen_url: str | None = None
    placeholders: list[str]


class VistaPreviaCorreoIn(BaseModel):
    cuerpo: str


class VistaPreviaCorreoOut(BaseModel):
    html: str
