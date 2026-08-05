from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.database.session import get_db
from app.schemas.area import AreaCreate, AreaOut, AreaUpdate
from app.services.area_service import AreaService

router = APIRouter(prefix="/areas", tags=["areas"])


@router.get("", response_model=list[AreaOut])
def listar(db: Session = Depends(get_db), _: dict = Depends(get_current_admin)):
    return AreaService(db).listar()


@router.post("", response_model=AreaOut, status_code=status.HTTP_201_CREATED)
def crear(data: AreaCreate, db: Session = Depends(get_db), admin: dict = Depends(get_current_admin)):
    return AreaService(db).crear(data, admin["sub"])


@router.put("/{area_id}", response_model=AreaOut)
def actualizar(area_id: int, data: AreaUpdate, db: Session = Depends(get_db),
               admin: dict = Depends(get_current_admin)):
    return AreaService(db).actualizar(area_id, data, admin["sub"])


@router.delete("/{area_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar(area_id: int, db: Session = Depends(get_db), admin: dict = Depends(get_current_admin)):
    AreaService(db).eliminar(area_id, admin["sub"])
