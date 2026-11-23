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


@router.post("/cambiar-password", response_model=TokenResponse)
@limiter.limit(settings.RATE_LIMIT_AUTH)
def cambiar_password(request: Request, data: CambiarPasswordRequest, db: Session = Depends(get_db),
                      admin: dict = Depends(get_current_admin),
                      meta: RequestMeta = Depends(get_request_meta)):
    """Cambia la contraseña PROPIA (cualquier rol; exige la actual). Responde con una sesión
    nueva para seguir trabajando: las demás sesiones abiertas de la cuenta se cierran. Con
    límite de intentos, para que una sesión robada no sirva para adivinar la contraseña."""
    return AuthService(db).cambiar_password(admin["id"], data, ip=meta.ip, user_agent=meta.user_agent)


@router.post("/resetear-password", status_code=status.HTTP_204_NO_CONTENT)
def resetear_password(data: ResetPasswordRequest, db: Session = Depends(get_db),
                       admin: dict = Depends(get_current_admin_full),
                       meta: RequestMeta = Depends(get_request_meta)):
    """Restablece la contraseña de OTRO administrador por su usuario (solo rol con acceso
    total). Mismas reglas que POST /administradores/{id}/password."""
    AuthService(db).resetear_password(admin["id"], data, ip=meta.ip, user_agent=meta.user_agent)
