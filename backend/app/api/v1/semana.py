from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin_full
from app.database.session import get_db
from app.schemas.configuracion import SemanaActivaSet
from app.services.configuracion_service import ConfiguracionService
from app.services.reserva_service import ReservaService

router = APIRouter(prefix="/semana", tags=["semana"])


@router.get("/activa")
def obtener_semana_activa(db: Session = Depends(get_db)):
    inicio, fin = ConfiguracionService(db).semana_activa()
    return {"inicio": inicio, "fin": fin}


@router.put("/activa", status_code=204)
def definir_semana_activa(data: SemanaActivaSet, db: Session = Depends(get_db),
                          admin: dict = Depends(get_current_admin_full)):
    ConfiguracionService(db).definir_semana_activa(data, admin["id"])


@router.post("/reiniciar")
def reiniciar_semana(fecha_lunes: date, db: Session = Depends(get_db),
                     admin: dict = Depends(get_current_admin_full)):
    """Cambia a 'cancelada' las reservas activas de la semana indicada. Nunca elimina filas."""
    afectadas = ReservaService(db).reiniciar_semana(fecha_lunes, admin["id"])
    return {"reservas_afectadas": afectadas}
