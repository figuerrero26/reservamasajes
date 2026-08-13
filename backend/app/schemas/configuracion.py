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
    zona_horaria: str
    semana_activa_inicio: date | None = None
    semana_activa_fin: date | None = None


class SemanaActivaSet(BaseModel):
    inicio: date
    fin: date
