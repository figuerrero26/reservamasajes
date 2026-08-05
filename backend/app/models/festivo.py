from datetime import date

from sqlalchemy import String, Date
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class Festivo(Base):
    """Día no laborable, excluido de la generación de horarios (RF-19)."""
    __tablename__ = "festivos"

    id: Mapped[int] = mapped_column(primary_key=True)
    fecha: Mapped[date] = mapped_column(Date, unique=True, index=True)
    descripcion: Mapped[str | None] = mapped_column(String(160), nullable=True)
