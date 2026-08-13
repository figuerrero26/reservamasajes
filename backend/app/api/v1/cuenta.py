from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.deps import RequestMeta, get_current_usuario, get_request_meta
from app.config import settings
from app.database.session import get_db
from app.schemas.cuenta import LoginUsuarioRequest, PerfilUsuarioOut, RegistroRequest, TokenUsuarioResponse
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
