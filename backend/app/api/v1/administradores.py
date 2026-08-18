from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin_full
from app.database.session import get_db
from app.schemas.administrador import AdministradorCreate, AdministradorOut
from app.services.administrador_service import AdministradorService

router = APIRouter(prefix="/administradores", tags=["administradores"])


@router.get("", response_model=list[AdministradorOut])
def listar(db: Session = Depends(get_db), _: dict = Depends(get_current_admin_full)):
    return AdministradorService(db).listar()


@router.post("", response_model=AdministradorOut, status_code=201)
def crear(data: AdministradorCreate, db: Session = Depends(get_db),
          admin: dict = Depends(get_current_admin_full)):
    return AdministradorService(db).crear(data, admin["id"])


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
