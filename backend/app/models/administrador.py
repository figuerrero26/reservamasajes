from datetime import datetime

from sqlalchemy import String, Boolean, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class Administrador(Base):
    """Cuenta administrativa. El modelo soporta múltiples admins y roles a futuro."""
    __tablename__ = "administrador"

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    nombre: Mapped[str] = mapped_column(String(120))
    hash_password: Mapped[str] = mapped_column(String(255))
    rol: Mapped[str] = mapped_column(String(40), default="admin")
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
