from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base

# Nombres de rol reconocidos por el backend (ver app/api/deps.py:get_current_admin_full).
ROL_ADMINISTRADOR = "administrador"
ROL_VISOR_RESERVAS = "visor_reservas"
ROLES_DISPONIBLES = (ROL_ADMINISTRADOR, ROL_VISOR_RESERVAS)


class Rol(Base):
    """Rol administrativo: 'administrador' (acceso total) o 'visor_reservas' (acceso de
    solo lectura, únicamente al listado de reservas — ver get_current_admin_full)."""
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    descripcion: Mapped[str | None] = mapped_column(String(160), nullable=True)
