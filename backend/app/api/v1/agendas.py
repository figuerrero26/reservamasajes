from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_current_admin_full
from app.database.session import get_db
from app.schemas.agenda import AgendaCreate, AgendaEstadoOut, AgendaOut, AgendaPublica, AgendaUpdate
from app.schemas.reserva import ReservaAdminOut
from app.services.agenda_service import AgendaService

router = APIRouter(prefix="/agendas", tags=["agendas"])


# ---- Público (colaborador): solo agendas reservables ----
@router.get("/publicas", response_model=list[AgendaPublica])
def publicas(servicio_id: int | None = None, db: Session = Depends(get_db)):
    """Agendas activas cuyo evento y área también están activos."""
    return AgendaService(db).listar_publicas(servicio_id=servicio_id)


# ---- Administración ----
@router.get("", response_model=list[AgendaOut])
def listar(db: Session = Depends(get_db), _: dict = Depends(get_current_admin)):
    return AgendaService(db).listar()


@router.post("", response_model=AgendaOut, status_code=status.HTTP_201_CREATED)
def crear(data: AgendaCreate, db: Session = Depends(get_db),
          admin: dict = Depends(get_current_admin_full)):
    return AgendaService(db).crear(data, admin["id"])


@router.put("/{agenda_id}", response_model=AgendaOut)
def actualizar(agenda_id: int, data: AgendaUpdate, db: Session = Depends(get_db),
               admin: dict = Depends(get_current_admin_full)):
    """Responde 409 con `reservas_afectadas` si el cambio dejaría reservas futuras fuera de
    la nueva grilla de turnos (no se modifica nada en ese caso)."""
    return AgendaService(db).actualizar(agenda_id, data, admin["id"])


@router.get("/{agenda_id}/reservas-futuras", response_model=list[ReservaAdminOut])
def reservas_futuras(agenda_id: int, db: Session = Depends(get_db), _: dict = Depends(get_current_admin_full)):
    return AgendaService(db).reservas_futuras(agenda_id)


@router.patch("/{agenda_id}/estado", response_model=AgendaEstadoOut)
def cambiar_estado(agenda_id: int, activa: bool, db: Session = Depends(get_db),
                   admin: dict = Depends(get_current_admin_full)):
    agenda, afectadas = AgendaService(db).cambiar_estado(agenda_id, activa, admin["id"])
    return AgendaEstadoOut(**AgendaOut.model_validate(agenda).model_dump(), reservas_afectadas=afectadas)
