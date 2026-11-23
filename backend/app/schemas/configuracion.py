from datetime import date

from pydantic import BaseModel, Field, model_validator

MAX_DIAS_SEMANA_ACTIVA = 62


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
    evento_unico_por_semana: bool = False
    contacto_correo: str | None = None
    contacto_telefono: str | None = None
    contacto_direccion: str | None = None
    terminos_condiciones: str | None = None
    zona_horaria: str
    semana_activa_inicio: date | None = None
    semana_activa_fin: date | None = None


class SemanaActivaSet(BaseModel):
    inicio: date
    fin: date

    @model_validator(mode="after")
    def _rango(self):
        if self.fin < self.inicio:
            raise ValueError("La fecha de fin debe ser igual o posterior a la de inicio")
        if (self.fin - self.inicio).days + 1 > MAX_DIAS_SEMANA_ACTIVA:
            raise ValueError(f"El periodo activo no puede superar {MAX_DIAS_SEMANA_ACTIVA} días")
        return self


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
