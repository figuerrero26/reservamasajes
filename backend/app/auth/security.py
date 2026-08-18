"""Cifrado de contraseñas (Bcrypt) y emisión/validación de JWT."""
from datetime import timedelta

import jwt
from passlib.context import CryptContext

from app.config import settings
from app.utils.time import now

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(
    subject: str, scope: str, entity_id: int, expires_minutes: int | None = None, **extra: str,
) -> str:
    """Emite un JWT para un administrador (scope='admin'), un usuario (scope='usuario') o un
    token de un solo uso (ej. scope='reset_password', con `expires_minutes` propio y más
    corto que la sesión normal).

    El claim `scope` es lo que impide que un token de un tipo se use en endpoints del otro,
    aunque ambos se firmen con el mismo JWT_SECRET.
    """
    expire = now() + timedelta(minutes=expires_minutes or settings.JWT_EXPIRE_MINUTES)
    payload = {"sub": subject, "scope": scope, "id": entity_id, "exp": expire, **extra}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
