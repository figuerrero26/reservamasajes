"""Configuración central de la aplicación.

Toda la configuración se lee desde variables de entorno (12-factor).
No existen valores fijos de negocio codificados aquí.
"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Entorno
    APP_ENV: str = "development"

    # Base de datos (MariaDB obligatorio — no usar PostgreSQL)
    DATABASE_URL: str = "mysql+pymysql://reservas:reservas@db:3306/reservas"

    # Seguridad / JWT
    JWT_SECRET: str = "cambie-esta-clave-en-produccion"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 480

    # Zona horaria única de la aplicación (fuente de verdad para toda la lógica de negocio)
    APP_TIMEZONE: str = "America/Bogota"

    # CORS (orígenes permitidos, separados por coma)
    CORS_ORIGINS: str = "http://localhost:8080,http://localhost:5173"

    # Administrador inicial (usado por el script de siembra, idempotente)
    ADMIN_USER: str = "admin"
    ADMIN_INITIAL_PASSWORD: str = "Admin123*"
    ADMIN_NOMBRE: str = "Administrador"

    # Duración de cita por defecto (minutos), configurable luego por agenda desde el panel
    DURACION_CITA_DEFAULT: int = 30

    # Rate limiting de registro/login de usuario (protección contra fuerza bruta / abuso)
    RATE_LIMIT_AUTH: str = "10/minute"

    # SMTP (valor por defecto/fallback si no hay fila en configuracion_smtp)
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_TLS: bool = True
    SMTP_FROM: str = ""
    SMTP_FROM_NAME: str = "Reservas de Bienestar"

    # Cancelación por el propio usuario: horas mínimas de anticipación (0 = sin restricción).
    # Puede sobreescribirse en configuracion_general (clave "cancelacion_horas_minimas").
    CANCELACION_HORAS_MINIMAS_DEFAULT: int = 0

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
