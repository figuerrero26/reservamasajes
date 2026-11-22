"""Dependencias comunes de la API."""
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.auth.security import decode_token
from app.database.session import get_db
from app.models import Administrador, Usuario
from app.models.rol import ROL_ADMINISTRADOR

bearer = HTTPBearer(auto_error=False)

_NO_AUTENTICADO = "No autenticado"
_TOKEN_INVALIDO = "Token inválido o expirado"


def _decodificar(creds: HTTPAuthorizationCredentials | None, scope_esperado: str) -> dict:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, _NO_AUTENTICADO)
    try:
        payload = decode_token(creds.credentials)
    except Exception:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, _TOKEN_INVALIDO)
    if payload.get("scope") != scope_esperado:
        # Un token de usuario no debe servir en endpoints de admin y viceversa, aunque
        # ambos estén firmados con el mismo JWT_SECRET.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, _TOKEN_INVALIDO)
    return payload


def get_current_admin(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> dict:
    """Valida el JWT y que la cuenta siga existiendo y activa en la base de datos.

    La firma del token por sí sola no basta: un administrador bloqueado, eliminado o al que
    se le cambió el rol seguiría con acceso hasta que el token expire (hasta 8 h). Por eso
    en cada petición se consulta la fila (una búsqueda por llave primaria) y el rol que se
    devuelve es el VIGENTE en la base de datos, no el que quedó grabado en el token.
    """
    payload = _decodificar(creds, "admin")
    admin = db.get(Administrador, payload.get("id"))
    if not admin or not admin.activo:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, _TOKEN_INVALIDO)
    return {**payload, "sub": admin.usuario, "rol": admin.rol.nombre}


def get_current_admin_full(admin: dict = Depends(get_current_admin)) -> dict:
    """Como get_current_admin, pero excluye roles restringidos (ej. `visor_reservas`, que
    solo puede consultar el listado de reservas)."""
    if admin.get("rol") != ROL_ADMINISTRADOR:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No tiene permisos para esta acción")
    return admin


def get_current_usuario(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> dict:
    """Valida el JWT del colaborador y que su cuenta siga existiendo y activa: una cuenta
    bloqueada o eliminada pierde el acceso de inmediato, no cuando expire el token."""
    payload = _decodificar(creds, "usuario")
    usuario = db.get(Usuario, payload.get("id"))
    if not usuario or not usuario.activo:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, _TOKEN_INVALIDO)
    return payload


def get_usuario_opcional(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> dict | None:
    """Para endpoints públicos que muestran información extra si hay sesión (p. ej. si el
    colaborador ya está inscrito en una sesión). Nunca falla: sin token o con un token
    inválido simplemente devuelve None."""
    if creds is None:
        return None
    try:
        return get_current_usuario(creds, db)
    except HTTPException:
        return None


class RequestMeta:
    __slots__ = ("ip", "user_agent")

    def __init__(self, ip: str | None, user_agent: str | None):
        self.ip = ip
        self.user_agent = user_agent


def get_request_meta(request: Request) -> RequestMeta:
    """IP y user-agent del cliente, usados para completar la auditoría. Detrás de nginx la
    IP real llega porque uvicorn corre con --proxy-headers (ver entrypoint.sh)."""
    ip = request.client.host if request.client else None
    return RequestMeta(ip=ip, user_agent=(request.headers.get("user-agent") or "")[:255] or None)
