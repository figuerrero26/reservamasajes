from datetime import datetime

from sqlalchemy import String, Boolean, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class Usuario(Base):
    """Colaborador. Sin usuario/contraseña: ingresa solo con la cédula."""
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(primary_key=True)
    cedula: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    nombre_completo: Mapped[str] = mapped_column(String(160))
    area: Mapped[str | None] = mapped_column(String(120), nullable=True)
    cargo: Mapped[str | None] = mapped_column(String(120), nullable=True)
    correo: Mapped[str | None] = mapped_column(String(160), nullable=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    # Excepción a la regla global de reserva única (RF-04), habilitada por el admin.
    puede_reservar_extra: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
