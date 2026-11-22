from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin_full
from app.database.session import get_db
from app.schemas.festivo import FestivoCreate, FestivoGuardadoOut, FestivoOut, FestivoUpdate
from app.schemas.reserva import ReservaAdminOut
from app.services.festivo_service import FestivoService

router = APIRouter(prefix="/festivos", tags=["festivos"])


@router.get("", response_model=list[FestivoOut])
def listar(db: Session = Depends(get_db), _: dict = Depends(get_current_admin_full)):
    return FestivoService(db).listar()


@router.post("", response_model=FestivoGuardadoOut, status_code=status.HTTP_201_CREATED)
def crear(data: FestivoCreate, db: Session = Depends(get_db),
          admin: dict = Depends(get_current_admin_full)):
    festivo, afectadas = FestivoService(db).crear(data, admin["id"])
    return FestivoGuardadoOut(**FestivoOut.model_validate(festivo).model_dump(), reservas_afectadas=afectadas)


@router.put("/{festivo_id}", response_model=FestivoGuardadoOut)
def actualizar(festivo_id: int, data: FestivoUpdate, db: Session = Depends(get_db),
               admin: dict = Depends(get_current_admin_full)):
    festivo, afectadas = FestivoService(db).actualizar(festivo_id, data, admin["id"])
    return FestivoGuardadoOut(**FestivoOut.model_validate(festivo).model_dump(), reservas_afectadas=afectadas)


@router.get("/{festivo_id}/reservas-afectadas", response_model=list[ReservaAdminOut])
def reservas_afectadas(festivo_id: int, db: Session = Depends(get_db),
                       _: dict = Depends(get_current_admin_full)):
    return FestivoService(db).afectadas_por_id(festivo_id)


@router.delete("/{festivo_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar(festivo_id: int, db: Session = Depends(get_db),
             admin: dict = Depends(get_current_admin_full)):
    FestivoService(db).eliminar(festivo_id, admin["id"])
