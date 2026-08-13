from sqlalchemy.orm import Session

from app.models import ConfiguracionSmtp
from app.schemas.smtp import SmtpConfigOut, SmtpConfigUpdate
from app.services import auditoria_service
from app.services.email_service import enviar_correo, resolver_config_smtp
from app.services.errors import DomainError
from app.utils.crypto import cifrar


class SmtpConfigService:
    def __init__(self, db: Session):
        self.db = db

    def obtener(self) -> SmtpConfigOut:
        fila = self.db.get(ConfiguracionSmtp, 1)
        if not fila:
            return SmtpConfigOut()
        return SmtpConfigOut(
            host=fila.host, port=fila.port, usuario=fila.usuario,
            password_configurada=bool(fila.password_cifrado),
            tls=fila.tls, from_email=fila.from_email, from_nombre=fila.from_nombre,
        )

    def actualizar(self, data: SmtpConfigUpdate, admin_id: int) -> SmtpConfigOut:
        fila = self.db.get(ConfiguracionSmtp, 1)
        if not fila:
            fila = ConfiguracionSmtp(id=1)
            self.db.add(fila)

        fila.host = data.host
        fila.port = data.port
        fila.usuario = data.usuario
        if data.password:  # None = conservar la ya guardada
            fila.password_cifrado = cifrar(data.password)
        fila.tls = data.tls
        fila.from_email = data.from_email
        fila.from_nombre = data.from_nombre
        fila.actualizado_por = admin_id

        auditoria_service.registrar(
            self.db, admin_id, "cambiar_config_smtp", "configuracion_smtp", fila.id,
            datos_nuevos={"host": fila.host, "port": fila.port, "usuario": fila.usuario,
                         "tls": fila.tls, "from_email": fila.from_email},
        )
        self.db.commit()
        return self.obtener()

    def enviar_prueba(self, destinatario: str, admin_id: int) -> None:
        config = resolver_config_smtp(self.db)
        if config is None:
            raise DomainError("No hay ninguna configuración SMTP definida (ni en el panel ni por variables de entorno)")
        exito, error = enviar_correo(
            config, destinatario, "Correo de prueba - Reservas de Bienestar",
            "Este es un correo de prueba enviado desde el panel administrativo. "
            "Si lo recibiste, la configuración SMTP funciona correctamente.",
        )
        auditoria_service.registrar(
            self.db, admin_id, "enviar_correo_prueba", "configuracion_smtp", None,
            datos_nuevos={"destinatario": destinatario, "exito": exito, "error": error},
        )
        self.db.commit()
        if not exito:
            raise DomainError(f"No se pudo enviar el correo de prueba: {error}")
