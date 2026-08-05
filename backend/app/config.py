"""Configuración central de la aplicación.

Toda la configuración se lee desde variables de entorno (12-factor).
No existen valores fijos de negocio codificados aquí.
"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Base de datos
    DATABASE_URL: str = "postgresql+psycopg://reservas:reservas@db:5432/reservas"

    # Seguridad / JWT
    JWT_SECRET: str = "cambie-esta-clave-en-produccion"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 480

    # Zona horaria única de la aplicación
    TIMEZONE: str = "America/Bogota"

    # CORS (orígenes permitidos, separados por coma)
    CORS_ORIGINS: str = "http://localhost:8080,http://localhost:5173"

    # Administrador inicial (usado por el script de siembra)
    ADMIN_USER: str = "admin"
    ADMIN_PASSWORD: str = "Admin123*"
    ADMIN_NOMBRE: str = "Administrador"

    # Duración de cita por defecto (minutos) — RF-09
    DURACION_CITA_DEFAULT: int = 30

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
