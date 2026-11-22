from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.api.deps import RequestMeta, get_current_admin, get_current_admin_full, get_request_meta
from app.config import settings
from app.database.session import get_db
from app.schemas.auth import (
    CambiarPasswordRequest, LoginRequest, ResetPasswordRequest, TokenResponse,
)
from app.services.auth_service import AuthService
from app.utils.limiter import limiter

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
@limiter.limit(settings.RATE_LIMIT_AUTH)
def login(request: Request, data: LoginRequest, db: Session = Depends(get_db),
          meta: RequestMeta = Depends(get_request_meta)):
    """Límite de intentos por IP, igual que el login de colaboradores: protege la cuenta de
    administración contra fuerza bruta."""
    return AuthService(db).login(data, ip=meta.ip, user_agent=meta.user_agent)


@router.post("/cambiar-password", status_code=status.HTTP_204_NO_CONTENT)
def cambiar_password(data: CambiarPasswordRequest, db: Session = Depends(get_db),
                      admin: dict = Depends(get_current_admin),
                      meta: RequestMeta = Depends(get_request_meta)):
    AuthService(db).cambiar_password(admin["id"], data, ip=meta.ip, user_agent=meta.user_agent)


@router.post("/resetear-password", status_code=status.HTTP_204_NO_CONTENT)
def resetear_password(data: ResetPasswordRequest, db: Session = Depends(get_db),
                       admin: dict = Depends(get_current_admin_full),
                       meta: RequestMeta = Depends(get_request_meta)):
    AuthService(db).resetear_password(admin["id"], data, ip=meta.ip, user_agent=meta.user_agent)
