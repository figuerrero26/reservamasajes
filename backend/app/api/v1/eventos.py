from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.schemas.evento import EventoPublico
from app.services.servicio_service import ServicioService

router = APIRouter(prefix="/eventos", tags=["eventos"])


@router.get("", response_model=list[EventoPublico])
def listar(db: Session = Depends(get_db)):
    """Catálogo público del portal (tarjetas). Sin autenticación."""
    return ServicioService(db).listar_eventos_publicos()


@router.get("/{servicio_id}", response_model=EventoPublico)
def obtener(servicio_id: int, db: Session = Depends(get_db)):
    return ServicioService(db).obtener_evento_publico(servicio_id)
