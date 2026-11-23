from typing import Literal

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_current_admin_full
from app.database.session import get_db
from app.schemas.servicio import ServicioCreate, ServicioEstadoOut, ServicioOut, ServicioUpdate
from app.services.servicio_service import ServicioService

router = APIRouter(prefix="/servicios", tags=["servicios"])


@router.get("", response_model=list[ServicioOut])
def listar(area_id: int | None = None,
           estado: Literal["vigente", "proximo", "finalizado", "sin_vigencia"] | None = None,
           db: Session = Depends(get_db), _: dict = Depends(get_current_admin)):
    """Con `area_id`: solo los eventos que tienen al menos una agenda en esa área. Con
    `estado`: solo los eventos en ese estado de vigencia (los finalizados conservan todo su
    historial de reservas, consultable en GET /reservas?servicio_id=…)."""
    return ServicioService(db).listar(area_id=area_id, estado=estado)


@router.post("", response_model=ServicioOut, status_code=status.HTTP_201_CREATED)
def crear(data: ServicioCreate, db: Session = Depends(get_db),
          admin: dict = Depends(get_current_admin_full)):
    """Crea el evento junto con su área, su primera agenda y su vigencia (obligatorias)."""
    return ServicioService(db).crear(data, admin["id"])


def _con_afectadas(serv, afectadas) -> ServicioEstadoOut:
    return ServicioEstadoOut(**ServicioOut.model_validate(serv).model_dump(), reservas_afectadas=afectadas)


@router.put("/{servicio_id}", response_model=ServicioEstadoOut)
def actualizar(servicio_id: int, data: ServicioUpdate, db: Session = Depends(get_db),
               admin: dict = Depends(get_current_admin_full)):
    """Si se acorta la vigencia, `reservas_afectadas` trae las reservas futuras que quedaron
    fuera del nuevo periodo: se conservan, y el administrador decide si las cancela."""
    return _con_afectadas(*ServicioService(db).actualizar(servicio_id, data, admin["id"]))


@router.post("/{servicio_id}/desactivar", response_model=ServicioEstadoOut)
def desactivar(servicio_id: int, db: Session = Depends(get_db),
               admin: dict = Depends(get_current_admin_full)):
    """Corta nuevas reservas del evento en todas sus agendas. Devuelve las reservas futuras
    existentes (se conservan) para que el administrador decida qué hacer con ellas."""
    return _con_afectadas(*ServicioService(db).cambiar_estado(servicio_id, False, admin["id"]))


@router.post("/{servicio_id}/activar", response_model=ServicioEstadoOut)
def activar(servicio_id: int, db: Session = Depends(get_db),
            admin: dict = Depends(get_current_admin_full)):
    """Vuelve a publicar el evento con las agendas que estaban activas (si está dentro de su
    vigencia)."""
    return _con_afectadas(*ServicioService(db).cambiar_estado(servicio_id, True, admin["id"]))
