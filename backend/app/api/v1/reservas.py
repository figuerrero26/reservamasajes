from datetime import date

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.database.session import get_db
from app.schemas.reserva import (
    CedulaRequest, CedulaResponse, HorariosResponse, ReservaCreate, ReservaOut,
)
from app.services.horario_service import HorarioService
from app.services.reserva_service import ReservaService

router = APIRouter(tags=["reservas"])


# ---- Flujo público del colaborador ----
@router.post("/reservas/validar-cedula", response_model=CedulaResponse)
def validar_cedula(data: CedulaRequest, db: Session = Depends(get_db)):
    valido, tiene = ReservaService(db).validar_cedula(data.cedula)
    return CedulaResponse(valido=valido, tiene_reserva_activa=tiene)


@router.get("/agendas/{agenda_id}/horarios", response_model=HorariosResponse)
def horarios(agenda_id: int, fecha: date = Query(...), db: Session = Depends(get_db)):
    slots = HorarioService(db).generar(agenda_id, fecha)
    return HorariosResponse(fecha=fecha, agenda_id=agenda_id, slots=slots)


@router.post("/reservas", response_model=ReservaOut, status_code=status.HTTP_201_CREATED)
def crear_reserva(data: ReservaCreate, db: Session = Depends(get_db)):
    return ReservaService(db).crear(data)


# ---- Administración de reservas ----
@router.delete("/reservas/{reserva_id}", response_model=ReservaOut)
def cancelar(reserva_id: int, db: Session = Depends(get_db),
             admin: dict = Depends(get_current_admin)):
    return ReservaService(db).cancelar(reserva_id, admin["sub"])


@router.post("/usuarios/{usuario_id}/habilitar-reserva", status_code=status.HTTP_204_NO_CONTENT)
def habilitar_reserva(usuario_id: int, db: Session = Depends(get_db),
                      admin: dict = Depends(get_current_admin)):
    ReservaService(db).habilitar_reserva_extra(usuario_id, admin["sub"])
