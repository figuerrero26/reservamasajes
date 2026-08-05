from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.database.session import get_db
from app.schemas.agenda import AgendaCreate, AgendaOut, AgendaPublica, AgendaUpdate
from app.services.agenda_service import AgendaService

router = APIRouter(prefix="/agendas", tags=["agendas"])


# ---- Público (colaborador): solo agendas activas ----
@router.get("/publicas", response_model=list[AgendaPublica])
def publicas(db: Session = Depends(get_db)):
    return AgendaService(db).listar_activas()


# ---- Administración ----
@router.get("", response_model=list[AgendaOut])
def listar(db: Session = Depends(get_db), _: dict = Depends(get_current_admin)):
    return AgendaService(db).listar()


@router.post("", response_model=AgendaOut, status_code=status.HTTP_201_CREATED)
def crear(data: AgendaCreate, db: Session = Depends(get_db),
          admin: dict = Depends(get_current_admin)):
    return AgendaService(db).crear(data, admin["sub"])


@router.put("/{agenda_id}", response_model=AgendaOut)
def actualizar(agenda_id: int, data: AgendaUpdate, db: Session = Depends(get_db),
               admin: dict = Depends(get_current_admin)):
    return AgendaService(db).actualizar(agenda_id, data, admin["sub"])


@router.patch("/{agenda_id}/estado", response_model=AgendaOut)
def cambiar_estado(agenda_id: int, activa: bool, db: Session = Depends(get_db),
                   admin: dict = Depends(get_current_admin)):
    return AgendaService(db).cambiar_estado(agenda_id, activa, admin["sub"])
