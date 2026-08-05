from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class ConfiguracionGeneral(Base):
    """Parámetros globales (colores corporativos, datos de la empresa, etc.)."""
    __tablename__ = "configuracion_general"

    id: Mapped[int] = mapped_column(primary_key=True)
    clave: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    valor: Mapped[str | None] = mapped_column(Text, nullable=True)
