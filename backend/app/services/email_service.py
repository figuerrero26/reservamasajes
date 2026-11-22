"""Envío de correo por SMTP, desacoplado de las operaciones de negocio.

Todos los puntos de entrada públicos (`enviar_*`) se invocan desde una BackgroundTask de
FastAPI, DESPUÉS de que la reserva/inscripción/cancelación ya se confirmó y committeó, y
abren su propia sesión de BD. Si el envío falla se registra en `notificaciones` con el error:
la operación de negocio ya existe y nunca se revierte ni se duplica por un fallo del correo.

Tipos de notificación (columna `notificaciones.tipo`):
- confirmacion            · reserva creada
- cancelacion             · reserva cancelada por el administrador
- confirmacion_inscripcion · inscripción a una actividad
- cancelacion_inscripcion  · inscripción cancelada por el administrador
- restablecer_password
"""
import html
import logging
import smtplib
import ssl
import time as time_mod
from dataclasses import dataclass
from email.message import EmailMessage

from sqlalchemy.orm import Session

from app.config import settings
from app.database.session import SessionLocal
from app.models import (
    Agenda, ConfiguracionSmtp, EstadoNotificacion, Inscripcion, Notificacion, Reserva, Usuario,
)
from app.repositories.configuracion_repository import ConfiguracionRepository
from app.utils.crypto import descifrar
from app.utils.time import now

logger = logging.getLogger("reservas.email")

# Plantilla editable desde el admin (configuracion_general, claves "email_confirmacion_*"):
# solo el asunto y el mensaje de introducción son personalizables por placeholders — el
# bloque de detalle (evento, fecha, hora, código) se genera aparte, siempre con el mismo
# formato, para que un texto mal editado nunca rompa esa información crítica.
ASUNTO_CONFIRMACION_DEFAULT = "Confirmación de tu reserva - {evento}"
CUERPO_CONFIRMACION_DEFAULT = (
    "¡Hola {nombre}!\n\n"
    "Tu espacio de bienestar quedó confirmado. Este es el detalle de tu reserva:"
)
PLACEHOLDERS_CONFIRMACION = [
    "nombre", "apellido", "evento", "area", "fecha", "hora_inicio", "hora_fin",
    "duracion", "codigo", "empresa", "sistema",
]

INTENTOS_ENVIO = 2
PAUSA_ENTRE_INTENTOS_SEG = 2
PUERTO_SSL_IMPLICITO = 465

_DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
_MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
          "septiembre", "octubre", "noviembre", "diciembre"]


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
    se usan las variables de entorno SMTP_*. Devuelve None si no hay ningún host configurado."""
    fila = db.get(ConfiguracionSmtp, 1)
    if fila and fila.host:
        password = descifrar(fila.password_cifrado) if fila.password_cifrado else None
        if fila.password_cifrado and password is None:
            # Pasa si se rotó JWT_SECRET (la clave de cifrado se deriva de él): hay que volver
            # a guardar la contraseña SMTP desde el panel.
            logger.warning("No se pudo descifrar la contraseña SMTP guardada; vuelva a guardarla en el panel.")
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


def _conectar(config: SmtpConfig) -> smtplib.SMTP:
    """Puerto 465 = SSL implícito (SMTP_SSL); cualquier otro con `tls` = STARTTLS; sin `tls`
    = texto plano (solo para servidores internos)."""
    contexto = ssl.create_default_context()
    if config.port == PUERTO_SSL_IMPLICITO:
        return smtplib.SMTP_SSL(config.host, config.port, timeout=15, context=contexto)
    server = smtplib.SMTP(config.host, config.port, timeout=15)
    if config.tls:
        server.starttls(context=contexto)
    return server


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
        with _conectar(config) as server:
            if config.usuario and config.password:
                server.login(config.usuario, config.password)
            server.send_message(mensaje)
        return True, None
    except Exception as exc:  # cualquier error de red/autenticación queda registrado, no se propaga
        return False, str(exc)[:1000]


def _enviar_con_reintento(config: SmtpConfig, destinatario: str, asunto: str, texto: str,
                          html_cuerpo: str | None) -> tuple[bool, str | None, int]:
    error = None
    for intento in range(1, INTENTOS_ENVIO + 1):
        exito, error = enviar_correo(config, destinatario, asunto, texto, html_cuerpo)
        if exito:
            return True, None, intento
        if intento < INTENTOS_ENVIO:
            time_mod.sleep(PAUSA_ENTRE_INTENTOS_SEG)
    return False, error, INTENTOS_ENVIO


def _registrar_y_enviar(
    db: Session, *, tipo: str, destinatario: str, usuario_id: int | None,
    asunto: str, texto: str, html_cuerpo: str | None,
    reserva_id: int | None = None, inscripcion_id: int | None = None,
) -> None:
    """Deja rastro en `notificaciones` y envía. Nunca lanza: un fallo de SMTP solo cambia el
    estado de la notificación a 'fallido' con el motivo."""
    notificacion = Notificacion(
        reserva_id=reserva_id, inscripcion_id=inscripcion_id, usuario_id=usuario_id, tipo=tipo,
        destinatario=destinatario, estado=EstadoNotificacion.PENDIENTE.value, intentos=0,
    )
    db.add(notificacion)
    db.flush()

    config_smtp = resolver_config_smtp(db)
    if config_smtp is None:
        notificacion.intentos = 0
        notificacion.estado = EstadoNotificacion.FALLIDO.value
        notificacion.error_mensaje = "SMTP no configurado"
        db.commit()
        return

    exito, error, intentos = _enviar_con_reintento(config_smtp, destinatario, asunto, texto, html_cuerpo)
    notificacion.intentos = intentos
    notificacion.estado = EstadoNotificacion.ENVIADO.value if exito else EstadoNotificacion.FALLIDO.value
    notificacion.error_mensaje = error
    notificacion.enviado_en = now() if exito else None
    db.commit()


# ---------------------------------------------------------------------------------------
# Plantillas
# ---------------------------------------------------------------------------------------

def fecha_legible(fecha) -> str:
    """'lunes 24 de noviembre de 2026' (sin depender del locale del sistema)."""
    return f"{_DIAS[fecha.weekday()]} {fecha.day} de {_MESES[fecha.month - 1]} de {fecha.year}"


def _aplicar_plantilla(texto: str, valores: dict[str, str]) -> str:
    """Sustitución de placeholders {clave} tolerante a texto libre: no usa str.format porque
    un admin podría escribir llaves sueltas en la plantilla y eso no debe romper el envío."""
    resultado = texto
    for clave, valor in valores.items():
        resultado = resultado.replace(f"{{{clave}}}", valor)
    return resultado


def _cuerpo_texto(intro: str, filas: list[tuple[str, str]], informacion_adicional: str | None,
                  config: dict[str, str | None] | None = None) -> str:
    lineas = [intro, "", *(f"- {k}: {v}" for k, v in filas)]
    if informacion_adicional:
        lineas += ["", informacion_adicional]
    contacto = _linea_contacto(config or {})
    if contacto:
        lineas += ["", contacto]
    return "\n".join(lineas)


def _linea_contacto(config: dict[str, str | None]) -> str:
    partes = [p for p in (config.get("contacto_correo"), config.get("contacto_telefono")) if p]
    return f"¿Dudas? Escríbenos: {' · '.join(partes)}" if partes else ""


def _url_absoluta(url: str | None) -> str | None:
    """Los archivos subidos se guardan como ruta relativa (/api/uploads/...) para que el
    portal la resuelva contra su propio origen — pero un correo no tiene "origen": hay que
    anteponer el dominio público antes de usarla en un <img src>."""
    if not url:
        return None
    if url.startswith("http://") or url.startswith("https://"):
        return url
    return f"{settings.FRONTEND_URL.rstrip('/')}{url}"


def _color_seguro(valor: str | None, defecto: str) -> str:
    """Solo acepta colores hexadecimales: el valor se inserta en un atributo `style`."""
    import re
    return valor if valor and re.fullmatch(r"#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?", valor) else defecto


def _cuerpo_html(
    intro: str, filas: list[tuple[str, str]], config: dict[str, str | None],
    informacion_adicional: str | None = None, imagen_url: str | None = None,
    etiqueta_estado: str | None = None,
) -> str:
    """HTML minimalista con la identidad del sistema (color, logo y banner opcional
    configurados en el panel). No depende de modelos ORM: recibe valores ya resueltos, así
    también se usa para la vista previa del admin con datos de ejemplo."""
    color = _color_seguro(config.get("color_primario"), "#111111")
    logo_url = _url_absoluta(config.get("logo_url"))
    sistema_nombre = config.get("sistema_nombre") or "Reservas de Bienestar"
    empresa_nombre = config.get("empresa_nombre") or ""

    intro_html = html.escape(intro).replace("\n", "<br>")
    filas_html = "".join(
        f'<tr><td style="padding:10px 0;color:#6b6b6b;font-size:14px;border-bottom:1px solid #f0f0f0;">{html.escape(k)}</td>'
        f'<td style="padding:10px 0;color:#111111;font-size:14px;font-weight:600;text-align:right;'
        f'border-bottom:1px solid #f0f0f0;">{html.escape(v)}</td></tr>'
        for k, v in filas
    )
    logo_html = (
        f'<img src="{html.escape(logo_url)}" alt="" height="32" style="display:block;">'
        if logo_url else
        f'<span style="color:#111111;font-size:17px;font-weight:700;letter-spacing:-0.2px;">{html.escape(sistema_nombre)}</span>'
    )
    banner_html = ""
    imagen_url_absoluta = _url_absoluta(imagen_url)
    if imagen_url_absoluta:
        banner_html = (
            f'<tr><td><img src="{html.escape(imagen_url_absoluta)}" alt="" width="520" '
            f'style="display:block;width:100%;max-width:520px;"></td></tr>'
        )
    estado_html = ""
    if etiqueta_estado:
        estado_html = (
            f'<p style="margin:0 0 16px;"><span style="display:inline-block;padding:4px 10px;border-radius:999px;'
            f'background:{color};color:#ffffff;font-size:12px;font-weight:600;">{html.escape(etiqueta_estado)}</span></p>'
        )
    info_adicional_html = ""
    if informacion_adicional:
        texto = html.escape(informacion_adicional).replace("\n", "<br>")
        info_adicional_html = f'<p style="margin:24px 0 0;color:#6b6b6b;font-size:13px;line-height:1.6;">{texto}</p>'
    contacto = _linea_contacto(config)
    contacto_html = (
        f'<p style="margin:16px 0 0;color:#6b6b6b;font-size:13px;">{html.escape(contacto)}</p>' if contacto else ""
    )

    return f"""\
<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;background:#f6f6f4;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" width="520" cellpadding="0" cellspacing="0"
                 style="max-width:520px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #ececec;">
            <tr>
              <td style="padding:22px 28px;border-bottom:3px solid {color};">{logo_html}</td>
            </tr>
            {banner_html}
            <tr>
              <td style="padding:32px 28px;">
                {estado_html}
                <p style="margin:0 0 24px;color:#111111;font-size:15px;line-height:1.65;">{intro_html}</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  {filas_html}
                </table>
                {info_adicional_html}
                {contacto_html}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px;background:#fafafa;color:#9a9a9a;font-size:12px;">
                {html.escape(empresa_nombre)}{" · " if empresa_nombre else ""}Este es un mensaje automático, no respondas a este correo.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""


# ---------------------------------------------------------------------------------------
# Reservas
# ---------------------------------------------------------------------------------------

def _placeholders_confirmacion(reserva: Reserva, agenda: Agenda, config: dict[str, str | None]) -> dict[str, str]:
    return {
        "nombre": reserva.usuario_nombre,
        "apellido": reserva.usuario_apellido or "",
        "evento": agenda.servicio.nombre,
        "area": agenda.area.nombre,
        "fecha": fecha_legible(reserva.fecha),
        "hora_inicio": reserva.hora_inicio.strftime("%H:%M"),
        "hora_fin": reserva.hora_fin.strftime("%H:%M"),
        "duracion": str(agenda.duracion_minutos),
        "codigo": str(reserva.id),
        "empresa": config.get("empresa_nombre") or "",
        "sistema": config.get("sistema_nombre") or "Reservas de Bienestar",
    }


def _filas_reserva(agenda: Agenda, reserva: Reserva) -> list[tuple[str, str]]:
    return [
        ("Evento", agenda.servicio.nombre),
        ("Área", agenda.area.nombre),
        ("Fecha", fecha_legible(reserva.fecha)),
        ("Hora", f"{reserva.hora_inicio.strftime('%H:%M')} - {reserva.hora_fin.strftime('%H:%M')}"),
        ("Duración", f"{agenda.duracion_minutos} minutos"),
        ("Código de reserva", f"#{reserva.id}"),
    ]


def _placeholders_vista_previa(config: dict[str, str | None]) -> dict[str, str]:
    """Datos de ejemplo para previsualizar la plantilla en el admin sin una reserva real."""
    return {
        "nombre": "Juan", "apellido": "Pérez", "evento": "Masaje de relajación", "area": "Oficinas",
        "fecha": fecha_legible(now().date()), "hora_inicio": "10:00", "hora_fin": "10:30",
        "duracion": "30", "codigo": "123",
        "empresa": config.get("empresa_nombre") or "",
        "sistema": config.get("sistema_nombre") or "Reservas de Bienestar",
    }


def generar_vista_previa(cuerpo_plantilla: str, config: dict[str, str | None], imagen_url: str | None) -> str:
    """Renderiza el correo de confirmación con datos de ejemplo, usando el texto que el admin
    está editando (aún sin guardar)."""
    valores = _placeholders_vista_previa(config)
    intro = _aplicar_plantilla(cuerpo_plantilla, valores)
    filas = [
        ("Evento", valores["evento"]), ("Área", valores["area"]), ("Fecha", valores["fecha"]),
        ("Hora", f"{valores['hora_inicio']} - {valores['hora_fin']}"),
        ("Duración", f"{valores['duracion']} minutos"), ("Código de reserva", f"#{valores['codigo']}"),
    ]
    return _cuerpo_html(intro, filas, config, None, imagen_url, "Confirmada")


def enviar_confirmacion_reserva(reserva_id: int) -> None:
    """BackgroundTask: abre su propia sesión (la de la request ya pudo haberse cerrado)."""
    db = SessionLocal()
    try:
        reserva = db.get(Reserva, reserva_id)
        if not reserva or not reserva.usuario_correo:
            return
        agenda = db.get(Agenda, reserva.agenda_id)
        if not agenda:
            return
        config = ConfiguracionRepository(db).get_all()
        valores = _placeholders_confirmacion(reserva, agenda, config)
        asunto = _aplicar_plantilla(config.get("email_confirmacion_asunto") or ASUNTO_CONFIRMACION_DEFAULT, valores)
        intro = _aplicar_plantilla(config.get("email_confirmacion_cuerpo") or CUERPO_CONFIRMACION_DEFAULT, valores)
        filas = _filas_reserva(agenda, reserva)
        info = agenda.servicio.informacion_adicional
        _registrar_y_enviar(
            db, tipo="confirmacion", destinatario=reserva.usuario_correo, usuario_id=reserva.usuario_id,
            reserva_id=reserva.id, asunto=asunto,
            texto=_cuerpo_texto(intro, filas, info, config),
            html_cuerpo=_cuerpo_html(intro, filas, config, info, config.get("email_confirmacion_imagen_url"), "Confirmada"),
        )
    except Exception:  # una BackgroundTask nunca debe tumbar el worker
        logger.exception("Error enviando confirmación de reserva %s", reserva_id)
    finally:
        db.close()


def enviar_cancelacion_reserva(reserva_id: int, motivo: str | None = None) -> None:
    """Aviso al colaborador de que el administrador canceló su reserva."""
    db = SessionLocal()
    try:
        reserva = db.get(Reserva, reserva_id)
        if not reserva or not reserva.usuario_correo:
            return
        agenda = db.get(Agenda, reserva.agenda_id)
        if not agenda:
            return
        config = ConfiguracionRepository(db).get_all()
        intro = (
            f"Hola {reserva.usuario_nombre},\n\n"
            "Lamentamos informarte que tu reserva fue cancelada por la administración."
        )
        if motivo:
            intro += f"\n\nMotivo: {motivo}"
        intro += "\n\nPuedes elegir otro horario disponible desde el portal."
        filas = _filas_reserva(agenda, reserva)
        _registrar_y_enviar(
            db, tipo="cancelacion", destinatario=reserva.usuario_correo, usuario_id=reserva.usuario_id,
            reserva_id=reserva.id, asunto=f"Tu reserva fue cancelada - {agenda.servicio.nombre}",
            texto=_cuerpo_texto(intro, filas, None, config),
            html_cuerpo=_cuerpo_html(intro, filas, config, None, None, "Cancelada"),
        )
    except Exception:
        logger.exception("Error enviando cancelación de reserva %s", reserva_id)
    finally:
        db.close()


# ---------------------------------------------------------------------------------------
# Inscripciones a actividades
# ---------------------------------------------------------------------------------------

def _filas_inscripcion(inscripcion: Inscripcion) -> list[tuple[str, str]]:
    sesion = inscripcion.sesion
    filas = [
        ("Actividad", sesion.actividad.nombre),
        ("Fecha", fecha_legible(sesion.fecha)),
        ("Hora", f"{sesion.hora_inicio.strftime('%H:%M')} - {sesion.hora_fin.strftime('%H:%M')}"),
    ]
    if sesion.lugar:
        filas.append(("Lugar", sesion.lugar))
    filas.append(("Código de inscripción", f"#{inscripcion.id}"))
    return filas


def enviar_confirmacion_inscripcion(inscripcion_id: int) -> None:
    """Confirmación de inscripción a una actividad. Igual que las reservas: corre después
    del commit, así un fallo del correo nunca duplica ni revierte la inscripción."""
    db = SessionLocal()
    try:
        inscripcion = db.get(Inscripcion, inscripcion_id)
        if not inscripcion or not inscripcion.usuario_correo:
            return
        actividad = inscripcion.sesion.actividad
        config = ConfiguracionRepository(db).get_all()
        intro = (
            f"¡Hola {inscripcion.usuario_nombre}!\n\n"
            f"Tu inscripción a «{actividad.nombre}» quedó registrada. Estos son los detalles:"
        )
        filas = _filas_inscripcion(inscripcion) + [("Estado", "Inscripción confirmada")]
        info = actividad.informacion_adicional
        _registrar_y_enviar(
            db, tipo="confirmacion_inscripcion", destinatario=inscripcion.usuario_correo,
            usuario_id=inscripcion.usuario_id, inscripcion_id=inscripcion.id,
            asunto=f"Inscripción confirmada - {actividad.nombre}",
            texto=_cuerpo_texto(intro, filas, info, config),
            html_cuerpo=_cuerpo_html(intro, filas, config, info, None, "Inscripción confirmada"),
        )
    except Exception:
        logger.exception("Error enviando confirmación de inscripción %s", inscripcion_id)
    finally:
        db.close()


def enviar_cancelacion_inscripcion(inscripcion_id: int, motivo: str | None = None) -> None:
    db = SessionLocal()
    try:
        inscripcion = db.get(Inscripcion, inscripcion_id)
        if not inscripcion or not inscripcion.usuario_correo:
            return
        actividad = inscripcion.sesion.actividad
        config = ConfiguracionRepository(db).get_all()
        intro = (
            f"Hola {inscripcion.usuario_nombre},\n\n"
            f"Tu inscripción a «{actividad.nombre}» fue cancelada por la administración."
        )
        if motivo:
            intro += f"\n\nMotivo: {motivo}"
        filas = _filas_inscripcion(inscripcion)
        _registrar_y_enviar(
            db, tipo="cancelacion_inscripcion", destinatario=inscripcion.usuario_correo,
            usuario_id=inscripcion.usuario_id, inscripcion_id=inscripcion.id,
            asunto=f"Inscripción cancelada - {actividad.nombre}",
            texto=_cuerpo_texto(intro, filas, None, config),
            html_cuerpo=_cuerpo_html(intro, filas, config, None, None, "Cancelada"),
        )
    except Exception:
        logger.exception("Error enviando cancelación de inscripción %s", inscripcion_id)
    finally:
        db.close()


# ---------------------------------------------------------------------------------------
# Cuenta
# ---------------------------------------------------------------------------------------

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
    """BackgroundTask del flujo "olvidé mi contraseña"."""
    db = SessionLocal()
    try:
        usuario = db.get(Usuario, usuario_id)
        if not usuario or not usuario.correo:
            return
        enlace = f"{settings.FRONTEND_URL.rstrip('/')}/restablecer-password?token={token}"
        _registrar_y_enviar(
            db, tipo="restablecer_password", destinatario=usuario.correo, usuario_id=usuario.id,
            asunto="Restablecer tu contraseña", texto=_cuerpo_restablecimiento(usuario, enlace), html_cuerpo=None,
        )
    except Exception:
        logger.exception("Error enviando restablecimiento de contraseña al usuario %s", usuario_id)
    finally:
        db.close()
