from fastapi import APIRouter, BackgroundTasks, Depends, Request, status
from sqlalchemy.orm import Session

from app.api.deps import RequestMeta, get_current_usuario, get_request_meta
from app.config import settings
from app.database.session import get_db
from app.schemas.cuenta import (
    LoginUsuarioRequest, OlvidePasswordRequest, PerfilUsuarioOut, RegistroRequest,
    RestablecerPasswordRequest, TokenUsuarioResponse,
)
from app.services.email_service import enviar_restablecimiento_password
from app.services.usuario_auth_service import UsuarioAuthService
from app.utils.limiter import limiter

router = APIRouter(prefix="/cuenta", tags=["cuenta"])


@router.post("/registro", response_model=TokenUsuarioResponse, status_code=201)
@limiter.limit(settings.RATE_LIMIT_AUTH)
def registro(request: Request, data: RegistroRequest, db: Session = Depends(get_db),
             meta: RequestMeta = Depends(get_request_meta)):
    return UsuarioAuthService(db).registrar(data, ip=meta.ip, user_agent=meta.user_agent)


@router.post("/login", response_model=TokenUsuarioResponse)
@limiter.limit(settings.RATE_LIMIT_AUTH)
def login(request: Request, data: LoginUsuarioRequest, db: Session = Depends(get_db),
          meta: RequestMeta = Depends(get_request_meta)):
    return UsuarioAuthService(db).login(data, ip=meta.ip, user_agent=meta.user_agent)


@router.get("/me", response_model=PerfilUsuarioOut)
def me(db: Session = Depends(get_db), usuario: dict = Depends(get_current_usuario)):
    return UsuarioAuthService(db).perfil(usuario["id"])


@router.post("/olvide-password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(settings.RATE_LIMIT_AUTH)
def olvide_password(request: Request, data: OlvidePasswordRequest, background_tasks: BackgroundTasks,
                     db: Session = Depends(get_db)):
    """Responde 204 exista o no la cuenta, para no revelar qué correos están registrados —
    el correo (si aplica) se envía en segundo plano."""
    resultado = UsuarioAuthService(db).solicitar_restablecimiento(data.correo)
    if resultado:
        usuario_id, token = resultado
        background_tasks.add_task(enviar_restablecimiento_password, usuario_id, token)


@router.post("/restablecer-password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(settings.RATE_LIMIT_AUTH)
def restablecer_password(request: Request, data: RestablecerPasswordRequest, db: Session = Depends(get_db)):
    UsuarioAuthService(db).restablecer_password(data.token, data.password_nueva)
