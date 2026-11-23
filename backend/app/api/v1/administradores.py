from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import RequestMeta, get_current_admin_full, get_request_meta
from app.database.session import get_db
from app.schemas.administrador import AdministradorCreate, AdministradorOut, RestablecerPasswordAdmin
from app.services.administrador_service import AdministradorService

# Todo el módulo exige el rol con acceso total (get_current_admin_full): un visor de reservas
# o un colaborador no pueden consultar cuentas ni cambiar contraseñas, tampoco con
# solicitudes directas a la API (403/401).
router = APIRouter(prefix="/administradores", tags=["administradores"])


@router.get("", response_model=list[AdministradorOut])
def listar(db: Session = Depends(get_db), _: dict = Depends(get_current_admin_full)):
    return AdministradorService(db).listar()


@router.post("", response_model=AdministradorOut, status_code=201)
def crear(data: AdministradorCreate, db: Session = Depends(get_db),
          admin: dict = Depends(get_current_admin_full)):
    return AdministradorService(db).crear(data, admin["id"])


@router.post("/{admin_id}/password", response_model=AdministradorOut)
def restablecer_password(admin_id: int, data: RestablecerPasswordAdmin, db: Session = Depends(get_db),
                         admin: dict = Depends(get_current_admin_full),
                         meta: RequestMeta = Depends(get_request_meta)):
    """Fija una contraseña nueva para OTRA cuenta administrativa (con confirmación y la
    política de fortaleza). Las sesiones abiertas de esa cuenta se cierran y queda en la
    auditoría. La contraseña nunca se devuelve ni se registra."""
    return AdministradorService(db).restablecer_password(
        admin_id, data, admin["id"], ip=meta.ip, user_agent=meta.user_agent,
    )


@router.post("/{admin_id}/desactivar", response_model=AdministradorOut)
def desactivar(admin_id: int, db: Session = Depends(get_db),
                admin: dict = Depends(get_current_admin_full)):
    return AdministradorService(db).desactivar(admin_id, admin["id"])


@router.post("/{admin_id}/activar", response_model=AdministradorOut)
def activar(admin_id: int, db: Session = Depends(get_db),
            admin: dict = Depends(get_current_admin_full)):
    return AdministradorService(db).activar(admin_id, admin["id"])


@router.delete("/{admin_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar(admin_id: int, db: Session = Depends(get_db),
             admin: dict = Depends(get_current_admin_full)):
    AdministradorService(db).eliminar(admin_id, admin["id"])
