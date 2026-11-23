from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_current_admin_full
from app.database.session import get_db
from app.schemas.area import AreaCreate, AreaEstadoOut, AreaOut, AreaUpdate
from app.services.area_service import AreaService

router = APIRouter(prefix="/areas", tags=["areas"])


@router.get("", response_model=list[AreaOut])
def listar(db: Session = Depends(get_db), _: dict = Depends(get_current_admin)):
    return AreaService(db).listar()


@router.post("", response_model=AreaOut, status_code=status.HTTP_201_CREATED)
def crear(data: AreaCreate, db: Session = Depends(get_db), admin: dict = Depends(get_current_admin_full)):
    return AreaService(db).crear(data, admin["id"])


@router.put("/{area_id}", response_model=AreaOut)
def actualizar(area_id: int, data: AreaUpdate, db: Session = Depends(get_db),
               admin: dict = Depends(get_current_admin_full)):
    return AreaService(db).actualizar(area_id, data, admin["id"])


def _estado(area_id: int, activo: bool, db: Session, admin: dict) -> AreaEstadoOut:
    area, afectadas, actividades = AreaService(db).cambiar_estado(area_id, activo, admin["id"])
    return AreaEstadoOut(
        **AreaOut.model_validate(area).model_dump(), reservas_afectadas=afectadas, actividades_afectadas=actividades,
    )


@router.post("/{area_id}/desactivar", response_model=AreaEstadoOut)
def desactivar(area_id: int, db: Session = Depends(get_db), admin: dict = Depends(get_current_admin_full)):
    return _estado(area_id, False, db, admin)


@router.post("/{area_id}/activar", response_model=AreaEstadoOut)
def activar(area_id: int, db: Session = Depends(get_db), admin: dict = Depends(get_current_admin_full)):
    return _estado(area_id, True, db, admin)
