from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.database.session import get_db
from app.schemas.servicio import ServicioCreate, ServicioOut, ServicioUpdate
from app.services.servicio_service import ServicioService

router = APIRouter(prefix="/servicios", tags=["servicios"])


@router.get("", response_model=list[ServicioOut])
def listar(db: Session = Depends(get_db), _: dict = Depends(get_current_admin)):
    return ServicioService(db).listar()


@router.post("", response_model=ServicioOut, status_code=status.HTTP_201_CREATED)
def crear(data: ServicioCreate, db: Session = Depends(get_db),
          admin: dict = Depends(get_current_admin)):
    return ServicioService(db).crear(data, admin["sub"])


@router.put("/{servicio_id}", response_model=ServicioOut)
def actualizar(servicio_id: int, data: ServicioUpdate, db: Session = Depends(get_db),
               admin: dict = Depends(get_current_admin)):
    return ServicioService(db).actualizar(servicio_id, data, admin["sub"])


@router.delete("/{servicio_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar(servicio_id: int, db: Session = Depends(get_db),
             admin: dict = Depends(get_current_admin)):
    ServicioService(db).eliminar(servicio_id, admin["sub"])
