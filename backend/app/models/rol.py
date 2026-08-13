from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class Rol(Base):
    """Rol administrativo. Hoy solo se usa 'administrador', el modelo soporta más a futuro."""
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    descripcion: Mapped[str | None] = mapped_column(String(160), nullable=True)
