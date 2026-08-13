from datetime import datetime

from sqlalchemy import String, Integer, Boolean, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class ConfiguracionSmtp(Base):
    """Configuración SMTP editable desde el panel (fila única, id=1).

    Si no existe fila, el sistema usa las variables de entorno SMTP_* como valor por
    defecto. `password_cifrado` se cifra con Fernet (ver app/utils/crypto.py) — nunca se
    almacena ni se devuelve en texto plano.
    """
    __tablename__ = "configuracion_smtp"

    id: Mapped[int] = mapped_column(primary_key=True)
    host: Mapped[str | None] = mapped_column(String(255), nullable=True)
    port: Mapped[int | None] = mapped_column(Integer, nullable=True)
    usuario: Mapped[str | None] = mapped_column(String(255), nullable=True)
    password_cifrado: Mapped[str | None] = mapped_column(Text, nullable=True)
    tls: Mapped[bool] = mapped_column(Boolean, default=True)
    from_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    from_nombre: Mapped[str | None] = mapped_column(String(160), nullable=True)
    actualizado_por: Mapped[int | None] = mapped_column(ForeignKey("administradores.id"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
