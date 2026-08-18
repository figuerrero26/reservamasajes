"""Envío de correo por SMTP, desacoplado de la creación de la reserva.

Se invoca desde una BackgroundTask de FastAPI (después de que la reserva ya se confirmó y
committeó), con su propia sesión de BD. Si el envío falla, se registra en `notificaciones`
con el error — la reserva ya existe y no se revierte por esto.
"""
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage

from sqlalchemy.orm import Session

from app.config import settings
from app.database.session import SessionLocal
from app.models import Agenda, ConfiguracionSmtp, EstadoNotificacion, Notificacion, Reserva, Usuario
from app.utils.crypto import descifrar
from app.utils.time import now


@dataclass
class SmtpConfig:
    host: str
    port: int
    usuario: str | None
    password: str | None
    tls: bool
    from_email: str
    from_nombre: str


def resolver_config_smtp(db: Session) -> SmtpConfig | None:
    """Configuración efectiva: la fila en BD tiene prioridad; si no existe o no tiene host,
    se usan las variables de entorno SMTP_*. Devuelve None si no hay ningún host configurado
    (SMTP no configurado todavía)."""
    fila = db.get(ConfiguracionSmtp, 1)
    if fila and fila.host:
        password = descifrar(fila.password_cifrado) if fila.password_cifrado else None
        return SmtpConfig(
            host=fila.host, port=fila.port or 587, usuario=fila.usuario, password=password,
            tls=fila.tls, from_email=fila.from_email or settings.SMTP_FROM,
            from_nombre=fila.from_nombre or settings.SMTP_FROM_NAME,
        )
    if settings.SMTP_HOST:
        return SmtpConfig(
            host=settings.SMTP_HOST, port=settings.SMTP_PORT, usuario=settings.SMTP_USER or None,
            password=settings.SMTP_PASSWORD or None, tls=settings.SMTP_TLS,
            from_email=settings.SMTP_FROM, from_nombre=settings.SMTP_FROM_NAME,
        )
    return None


def enviar_correo(config: SmtpConfig, destinatario: str, asunto: str, cuerpo_texto: str) -> tuple[bool, str | None]:
    mensaje = EmailMessage()
    mensaje["Subject"] = asunto
    mensaje["From"] = f"{config.from_nombre} <{config.from_email}>"
    mensaje["To"] = destinatario
    mensaje.set_content(cuerpo_texto)

    try:
        if config.tls:
            contexto = ssl.create_default_context()
            with smtplib.SMTP(config.host, config.port, timeout=10) as server:
                server.starttls(context=contexto)
                if config.usuario and config.password:
                    server.login(config.usuario, config.password)
                server.send_message(mensaje)
        else:
            with smtplib.SMTP(config.host, config.port, timeout=10) as server:
                if config.usuario and config.password:
                    server.login(config.usuario, config.password)
                server.send_message(mensaje)
        return True, None
    except Exception as exc:  # cualquier error de red/autenticación queda registrado, no se propaga
        return False, str(exc)


def _cuerpo_confirmacion(reserva: Reserva, agenda: Agenda) -> str:
    lineas = [
        f"Hola {reserva.usuario_nombre},",
        "",
        f"Tu reserva fue confirmada. Aquí el detalle:",
        f"- Evento: {agenda.servicio.nombre}",
        f"- Área: {agenda.area.nombre}",
        f"- Fecha: {reserva.fecha.isoformat()}",
        f"- Hora: {reserva.hora_inicio.strftime('%H:%M')} - {reserva.hora_fin.strftime('%H:%M')}",
        f"- Duración: {agenda.duracion_minutos} minutos",
        f"- Código de reserva: #{reserva.id}",
    ]
    if agenda.servicio.informacion_adicional:
        lineas += ["", agenda.servicio.informacion_adicional]
    return "\n".join(lineas)


def enviar_confirmacion_reserva(reserva_id: int) -> None:
    """Punto de entrada para la BackgroundTask: abre su propia sesión (la de la request ya
    pudo haberse cerrado cuando esta tarea corre)."""
    db = SessionLocal()
    try:
        reserva = db.get(Reserva, reserva_id)
        if not reserva:
            return
        agenda = db.get(Agenda, reserva.agenda_id)
        if not reserva.usuario_correo or not agenda:
            return

        notificacion = Notificacion(
            reserva_id=reserva.id, usuario_id=reserva.usuario_id, tipo="confirmacion",
            destinatario=reserva.usuario_correo, estado=EstadoNotificacion.PENDIENTE.value, intentos=0,
        )
        db.add(notificacion)
        db.flush()

        config = resolver_config_smtp(db)
        notificacion.intentos = 1
        if config is None:
            notificacion.estado = EstadoNotificacion.FALLIDO.value
            notificacion.error_mensaje = "SMTP no configurado"
            db.commit()
            return

        asunto = f"Confirmación de reserva - {agenda.servicio.nombre}"
        cuerpo = _cuerpo_confirmacion(reserva, agenda)
        exito, error = enviar_correo(config, reserva.usuario_correo, asunto, cuerpo)

        notificacion.estado = EstadoNotificacion.ENVIADO.value if exito else EstadoNotificacion.FALLIDO.value
        notificacion.error_mensaje = error
        notificacion.enviado_en = now() if exito else None
        db.commit()
    finally:
        db.close()


def _cuerpo_restablecimiento(usuario: Usuario, enlace: str) -> str:
    return "\n".join([
        f"Hola {usuario.nombre},",
        "",
        "Recibimos una solicitud para restablecer tu contraseña.",
        f"Si fuiste tú, ingresa a este enlace (válido por {settings.RESET_PASSWORD_EXPIRE_MINUTES} minutos):",
        enlace,
        "",
        "Si no fuiste tú, ignora este correo: tu contraseña actual sigue funcionando igual.",
    ])


def enviar_restablecimiento_password(usuario_id: int, token: str) -> None:
    """Punto de entrada para la BackgroundTask, igual patrón que enviar_confirmacion_reserva:
    sesión propia porque corre después de que la request original ya respondió."""
    db = SessionLocal()
    try:
        usuario = db.get(Usuario, usuario_id)
        if not usuario or not usuario.correo:
            return

        enlace = f"{settings.FRONTEND_URL.rstrip('/')}/restablecer-password?token={token}"
        notificacion = Notificacion(
            reserva_id=None, usuario_id=usuario.id, tipo="restablecer_password",
            destinatario=usuario.correo, estado=EstadoNotificacion.PENDIENTE.value, intentos=0,
        )
        db.add(notificacion)
        db.flush()

        config = resolver_config_smtp(db)
        notificacion.intentos = 1
        if config is None:
            notificacion.estado = EstadoNotificacion.FALLIDO.value
            notificacion.error_mensaje = "SMTP no configurado"
            db.commit()
            return

        asunto = "Restablecer tu contraseña"
        cuerpo = _cuerpo_restablecimiento(usuario, enlace)
        exito, error = enviar_correo(config, usuario.correo, asunto, cuerpo)

        notificacion.estado = EstadoNotificacion.ENVIADO.value if exito else EstadoNotificacion.FALLIDO.value
        notificacion.error_mensaje = error
        notificacion.enviado_en = now() if exito else None
        db.commit()
    finally:
        db.close()
