from datetime import date

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin_full
from app.database.session import get_db
from app.schemas.bloqueo import BloqueoCreadoOut, BloqueoCreate, BloqueoOut
from app.schemas.reserva import ReservaAdminOut
from app.services.bloqueo_service import BloqueoService

router = APIRouter(prefix="/bloqueos", tags=["bloqueos"])


@router.get("", response_model=list[BloqueoOut])
def listar(fecha: date | None = None, db: Session = Depends(get_db),
           _: dict = Depends(get_current_admin_full)):
    return BloqueoService(db).listar(fecha)


@router.post("", response_model=BloqueoCreadoOut, status_code=status.HTTP_201_CREATED)
def crear(data: BloqueoCreate, db: Session = Depends(get_db),
          admin: dict = Depends(get_current_admin_full)):
    bloqueo, afectadas = BloqueoService(db).crear(data, admin["id"])
    return BloqueoCreadoOut(**BloqueoOut.model_validate(bloqueo).model_dump(), reservas_afectadas=afectadas)


@router.get("/{bloqueo_id}/reservas-afectadas", response_model=list[ReservaAdminOut])
def reservas_afectadas(bloqueo_id: int, db: Session = Depends(get_db),
                       _: dict = Depends(get_current_admin_full)):
    return BloqueoService(db).afectadas_por_id(bloqueo_id)


@router.delete("/{bloqueo_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar(bloqueo_id: int, db: Session = Depends(get_db),
             admin: dict = Depends(get_current_admin_full)):
    BloqueoService(db).eliminar(bloqueo_id, admin["id"])
