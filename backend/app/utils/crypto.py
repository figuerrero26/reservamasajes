"""Cifrado simétrico para secretos que deben poder leerse de vuelta (a diferencia de las
contraseñas de usuario, que se hashean con Bcrypt de forma irreversible). Se usa solo para
la contraseña SMTP guardada en configuracion_smtp: el sistema necesita recuperarla en texto
plano para autenticar contra el servidor de correo, pero nunca debe mostrarla en pantalla.

La clave se deriva de JWT_SECRET para no exigir una variable de entorno adicional.
"""
import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


def _fernet() -> Fernet:
    clave = hashlib.sha256(settings.JWT_SECRET.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(clave))


def cifrar(texto: str) -> str:
    return _fernet().encrypt(texto.encode("utf-8")).decode("utf-8")


def descifrar(token: str) -> str | None:
    try:
        return _fernet().decrypt(token.encode("utf-8")).decode("utf-8")
    except (InvalidToken, ValueError):
        return None
