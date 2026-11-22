from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin_full
from app.database.session import get_db
from app.schemas.configuracion import SemanaActivaSet
from app.services.configuracion_service import ConfiguracionService
from app.services.email_service import enviar_cancelacion_reserva
from app.services.reserva_service import ReservaService

router = APIRouter(prefix="/semana", tags=["semana"])

MOTIVO_REINICIO = "Reinicio de la programación semanal"


@router.get("/activa")
def obtener_semana_activa(db: Session = Depends(get_db)):
    inicio, fin = ConfiguracionService(db).semana_activa()
    return {"inicio": inicio, "fin": fin}


@router.put("/activa", status_code=204)
def definir_semana_activa(data: SemanaActivaSet, db: Session = Depends(get_db),
                          admin: dict = Depends(get_current_admin_full)):
    ConfiguracionService(db).definir_semana_activa(data, admin["id"])


@router.post("/reiniciar")
def reiniciar_semana(fecha_lunes: date, background_tasks: BackgroundTasks, notificar: bool = True,
                     db: Session = Depends(get_db), admin: dict = Depends(get_current_admin_full)):
    """Cambia a 'cancelada' las reservas activas FUTURAS de la semana indicada (nunca
    elimina filas) y, por defecto, avisa a cada colaborador por correo."""
    canceladas = ReservaService(db).reiniciar_semana(fecha_lunes, admin["id"])
    if notificar:
        for rid in canceladas:
            background_tasks.add_task(enviar_cancelacion_reserva, rid, MOTIVO_REINICIO)
    return {"reservas_afectadas": len(canceladas)}
