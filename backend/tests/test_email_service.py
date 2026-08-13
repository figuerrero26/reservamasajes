"""EmailService: el envío está desacoplado de la reserva — un fallo de SMTP nunca la revierte."""
from datetime import date, time, timedelta
from unittest.mock import MagicMock, patch

from app.config import settings
from app.database.session import SessionLocal
from app.models import EstadoNotificacion, EstadoReserva, Notificacion, Reserva
from app.services.email_service import enviar_confirmacion_reserva
from app.services.reserva_service import ReservaService


def _lunes_futuro() -> date:
    d = date.today() + timedelta(days=14)
    return d - timedelta(days=d.weekday())


def _crear_reserva(db, datos_base) -> Reserva:
    return ReservaService(db).crear(
        agenda_id=datos_base["agenda_id"], fecha=_lunes_futuro(), hora_inicio=time(9, 0),
        usuario_id=datos_base["usuario_id"],
    )


def test_envio_exitoso_registra_notificacion_enviada(db, datos_base, monkeypatch):
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com")
    monkeypatch.setattr(settings, "SMTP_PORT", 587)
    monkeypatch.setattr(settings, "SMTP_TLS", True)
    monkeypatch.setattr(settings, "SMTP_FROM", "no-reply@example.com")
    monkeypatch.setattr(settings, "SMTP_USER", "")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "")

    reserva = _crear_reserva(db, datos_base)

    servidor_falso = MagicMock()
    with patch("app.services.email_service.smtplib.SMTP") as MockSMTP:
        MockSMTP.return_value.__enter__.return_value = servidor_falso
        enviar_confirmacion_reserva(reserva.id)

    servidor_falso.send_message.assert_called_once()

    verificacion = SessionLocal()
    try:
        notif = verificacion.query(Notificacion).filter_by(reserva_id=reserva.id).one()
        assert notif.estado == EstadoNotificacion.ENVIADO.value
        assert notif.intentos == 1
        assert notif.error_mensaje is None

        # La reserva sigue activa: el envío de correo no la afecta en absoluto.
        reserva_bd = verificacion.get(Reserva, reserva.id)
        assert reserva_bd.estado == EstadoReserva.ACTIVA.value
    finally:
        verificacion.close()


def test_fallo_de_smtp_no_revierte_la_reserva(db, datos_base, monkeypatch):
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com")
    monkeypatch.setattr(settings, "SMTP_PORT", 587)
    monkeypatch.setattr(settings, "SMTP_TLS", True)
    monkeypatch.setattr(settings, "SMTP_FROM", "no-reply@example.com")

    reserva = _crear_reserva(db, datos_base)

    with patch("app.services.email_service.smtplib.SMTP") as MockSMTP:
        MockSMTP.side_effect = OSError("No se pudo conectar al servidor SMTP")
        enviar_confirmacion_reserva(reserva.id)  # no debe lanzar

    verificacion = SessionLocal()
    try:
        notif = verificacion.query(Notificacion).filter_by(reserva_id=reserva.id).one()
        assert notif.estado == EstadoNotificacion.FALLIDO.value
        assert notif.error_mensaje is not None

        reserva_bd = verificacion.get(Reserva, reserva.id)
        assert reserva_bd.estado == EstadoReserva.ACTIVA.value  # la reserva sigue existiendo
    finally:
        verificacion.close()


def test_sin_smtp_configurado_registra_fallido_sin_intentar_conectar(db, datos_base, monkeypatch):
    monkeypatch.setattr(settings, "SMTP_HOST", "")

    reserva = _crear_reserva(db, datos_base)
    enviar_confirmacion_reserva(reserva.id)

    verificacion = SessionLocal()
    try:
        notif = verificacion.query(Notificacion).filter_by(reserva_id=reserva.id).one()
        assert notif.estado == EstadoNotificacion.FALLIDO.value
        assert notif.error_mensaje == "SMTP no configurado"
    finally:
        verificacion.close()
