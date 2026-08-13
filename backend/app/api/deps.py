"""Dependencias comunes de la API."""
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.security import decode_token

bearer = HTTPBearer(auto_error=False)


def _decodificar(creds: HTTPAuthorizationCredentials | None, scope_esperado: str) -> dict:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No autenticado")
    try:
        payload = decode_token(creds.credentials)
    except Exception:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token inválido o expirado")
    if payload.get("scope") != scope_esperado:
        # Un token de usuario no debe servir en endpoints de admin y viceversa, aunque
        # ambos estén firmados con el mismo JWT_SECRET.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token inválido o expirado")
    return payload


def get_current_admin(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> dict:
    """Valida el JWT y devuelve el payload del administrador autenticado."""
    return _decodificar(creds, "admin")


def get_current_usuario(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> dict:
    """Valida el JWT y devuelve el payload del usuario (colaborador) autenticado."""
    return _decodificar(creds, "usuario")


class RequestMeta:
    __slots__ = ("ip", "user_agent")

    def __init__(self, ip: str | None, user_agent: str | None):
        self.ip = ip
        self.user_agent = user_agent


def get_request_meta(request: Request) -> RequestMeta:
    """IP y user-agent del cliente, usados para completar la auditoría."""
    ip = request.client.host if request.client else None
    return RequestMeta(ip=ip, user_agent=request.headers.get("user-agent"))
