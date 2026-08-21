"""Envío de correo por SMTP, desacoplado de la creación de la reserva.

Se invoca desde una BackgroundTask de FastAPI (después de que la reserva ya se confirmó y
committeó), con su propia sesión de BD. Si el envío falla, se registra en `notificaciones`
con el error — la reserva ya existe y no se revierte por esto.
"""
import html
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage

from sqlalchemy.orm import Session

from app.config import settings
from app.database.session import SessionLocal
from app.models import Agenda, ConfiguracionSmtp, EstadoNotificacion, Notificacion, Reserva, Usuario
from app.repositories.configuracion_repository import ConfiguracionRepository
from app.utils.crypto import descifrar
from app.utils.time import now

# Plantilla editable desde el admin (configuracion_general, claves "email_confirmacion_*"):
# solo el asunto y el mensaje de introducción son personalizables por placeholders — el
# bloque de detalle de la reserva (evento, fecha, hora, código) se genera aparte, siempre con
# el mismo formato, para que un texto mal editado nunca rompa esa información crítica.
ASUNTO_CONFIRMACION_DEFAULT = "Confirmación de tu reserva - {evento}"
CUERPO_CONFIRMACION_DEFAULT = (
    "¡Hola {nombre}!\n\n"
    "Tu espacio de bienestar quedó confirmado. Este es el detalle de tu reserva:"
)
PLACEHOLDERS_CONFIRMACION = [
    "nombre", "apellido", "evento", "area", "fecha", "hora_inicio", "hora_fin",
    "duracion", "codigo", "empresa", "sistema",
]


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


def enviar_correo(config: SmtpConfig, destinatario: str, asunto: str, cuerpo_texto: str,
                   cuerpo_html: str | None = None) -> tuple[bool, str | None]:
    mensaje = EmailMessage()
    mensaje["Subject"] = asunto
    mensaje["From"] = f"{config.from_nombre} <{config.from_email}>"
    mensaje["To"] = destinatario
    mensaje.set_content(cuerpo_texto)
    if cuerpo_html:
        mensaje.add_alternative(cuerpo_html, subtype="html")

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


def _placeholders_confirmacion(reserva: Reserva, agenda: Agenda, config: dict[str, str | None]) -> dict[str, str]:
    return {
        "nombre": reserva.usuario_nombre,
        "apellido": reserva.usuario_apellido or "",
        "evento": agenda.servicio.nombre,
        "area": agenda.area.nombre,
        "fecha": reserva.fecha.isoformat(),
        "hora_inicio": reserva.hora_inicio.strftime("%H:%M"),
        "hora_fin": reserva.hora_fin.strftime("%H:%M"),
        "duracion": str(agenda.duracion_minutos),
        "codigo": str(reserva.id),
        "empresa": config.get("empresa_nombre") or "",
        "sistema": config.get("sistema_nombre") or "Reservas de Bienestar",
    }


def _aplicar_plantilla(texto: str, valores: dict[str, str]) -> str:
    """Sustitución de placeholders {clave} tolerante a texto libre: no usa str.format porque
    un admin podría escribir llaves sueltas en la plantilla y eso no debe romper el envío."""
    resultado = texto
    for clave, valor in valores.items():
        resultado = resultado.replace(f"{{{clave}}}", valor)
    return resultado


def _cuerpo_confirmacion_texto(intro: str, agenda: Agenda, reserva: Reserva) -> str:
    lineas = [
        intro, "",
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


def _cuerpo_confirmacion_html(intro: str, agenda: Agenda, reserva: Reserva, config: dict[str, str | None]) -> str:
    """HTML con la temática del sistema (color y logo configurados en el panel admin), para
    que el correo se vea como parte de la misma aplicación en vez de un texto plano genérico."""
    color = config.get("color_primario") or "#1F3A5F"
    logo_url = config.get("logo_url")
    sistema_nombre = config.get("sistema_nombre") or "Reservas de Bienestar"
    empresa_nombre = config.get("empresa_nombre") or ""

    intro_html = html.escape(intro).replace("\n", "<br>")
    filas = [
        ("Evento", agenda.servicio.nombre),
        ("Área", agenda.area.nombre),
        ("Fecha", reserva.fecha.isoformat()),
        ("Hora", f"{reserva.hora_inicio.strftime('%H:%M')} - {reserva.hora_fin.strftime('%H:%M')}"),
        ("Duración", f"{agenda.duracion_minutos} minutos"),
        ("Código de reserva", f"#{reserva.id}"),
    ]
    filas_html = "".join(
        f'<tr><td style="padding:8px 0;color:#5b6b7a;font-size:14px;">{html.escape(k)}</td>'
        f'<td style="padding:8px 0;color:#1a2733;font-size:14px;font-weight:600;text-align:right;">'
        f'{html.escape(v)}</td></tr>'
        for k, v in filas
    )
    logo_html = (
        f'<img src="{html.escape(logo_url)}" alt="" height="36" style="display:block;">'
        if logo_url else f'<span style="color:#ffffff;font-size:18px;font-weight:600;">{html.escape(sistema_nombre)}</span>'
    )
    info_adicional_html = ""
    if agenda.servicio.informacion_adicional:
        texto = html.escape(agenda.servicio.informacion_adicional).replace("\n", "<br>")
        info_adicional_html = f'<p style="margin:20px 0 0;color:#5b6b7a;font-size:13px;">{texto}</p>'

    return f"""\
<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#F4F7FB;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0"
                 style="max-width:480px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:{color};padding:20px 24px;">{logo_html}</td>
            </tr>
            <tr>
              <td style="padding:28px 24px;">
                <p style="margin:0 0 20px;color:#1a2733;font-size:15px;line-height:1.6;">{intro_html}</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                       style="border-top:1px solid #edf0f3;">
                  {filas_html}
                </table>
                {info_adicional_html}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:#F4F7FB;color:#8a97a3;font-size:12px;">
                {html.escape(empresa_nombre)} · Este es un mensaje automático, no respondas a este correo.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""


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

        config_smtp = resolver_config_smtp(db)
        notificacion.intentos = 1
        if config_smtp is None:
            notificacion.estado = EstadoNotificacion.FALLIDO.value
            notificacion.error_mensaje = "SMTP no configurado"
            db.commit()
            return

        config_general = ConfiguracionRepository(db).get_all()
        valores = _placeholders_confirmacion(reserva, agenda, config_general)
        asunto = _aplicar_plantilla(
            config_general.get("email_confirmacion_asunto") or ASUNTO_CONFIRMACION_DEFAULT, valores,
        )
        intro = _aplicar_plantilla(
            config_general.get("email_confirmacion_cuerpo") or CUERPO_CONFIRMACION_DEFAULT, valores,
        )
        cuerpo_texto = _cuerpo_confirmacion_texto(intro, agenda, reserva)
        cuerpo_html = _cuerpo_confirmacion_html(intro, agenda, reserva, config_general)
        exito, error = enviar_correo(
            config_smtp, reserva.usuario_correo, asunto, cuerpo_texto, cuerpo_html,
        )

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
