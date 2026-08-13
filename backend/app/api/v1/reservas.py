from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_current_usuario
from app.database.session import get_db
from app.schemas.reserva import (
    HorariosResponse, ReservaCreadaOut, ReservaCreate, ReservaCreateManual, ReservaOut,
)
from app.services.email_service import enviar_confirmacion_reserva
from app.services.horario_service import HorarioService
from app.services.reserva_service import ReservaService

router = APIRouter(tags=["reservas"])


# ---- Flujo público (requiere sesión de usuario) ----
@router.get("/agendas/{agenda_id}/horarios", response_model=HorariosResponse)
def horarios(agenda_id: int, fecha: date = Query(...), db: Session = Depends(get_db)):
    slots = HorarioService(db).generar(agenda_id, fecha)
    return HorariosResponse(fecha=fecha, agenda_id=agenda_id, slots=slots)


@router.post("/reservas", response_model=ReservaCreadaOut, status_code=status.HTTP_201_CREATED)
def crear_reserva(data: ReservaCreate, background_tasks: BackgroundTasks,
                   db: Session = Depends(get_db), usuario: dict = Depends(get_current_usuario)):
    reserva = ReservaService(db).crear(
        agenda_id=data.agenda_id, fecha=data.fecha, hora_inicio=data.hora_inicio,
        usuario_id=usuario["id"],
    )
    background_tasks.add_task(enviar_confirmacion_reserva, reserva.id)
    return ReservaCreadaOut(**ReservaOut.model_validate(reserva).model_dump(), correo_confirmacion="pendiente")


@router.get("/reservas/mias", response_model=list[ReservaOut])
def mis_reservas(db: Session = Depends(get_db), usuario: dict = Depends(get_current_usuario)):
    """Minimización de datos: solo las reservas del usuario autenticado, nunca de otro."""
    return ReservaService(db).mias(usuario["id"])


@router.post("/reservas/{reserva_id}/cancelar", response_model=ReservaOut)
def cancelar_propia(reserva_id: int, db: Session = Depends(get_db),
                     usuario: dict = Depends(get_current_usuario)):
    return ReservaService(db).cancelar_propia(reserva_id, usuario["id"])


# ---- Administración de reservas ----
@router.get("/reservas", response_model=list[ReservaOut])
def buscar(
    db: Session = Depends(get_db), _: dict = Depends(get_current_admin),
    nombre: str | None = None, correo: str | None = None,
    fecha: date | None = None, agenda_id: int | None = None,
):
    return ReservaService(db).buscar(nombre=nombre, correo=correo, fecha=fecha, agenda_id=agenda_id)


@router.post("/reservas/manual", response_model=ReservaCreadaOut, status_code=status.HTTP_201_CREATED)
def crear_reserva_manual(data: ReservaCreateManual, background_tasks: BackgroundTasks,
                          db: Session = Depends(get_db), admin: dict = Depends(get_current_admin)):
    reserva = ReservaService(db).crear_manual(data, admin["id"])
    background_tasks.add_task(enviar_confirmacion_reserva, reserva.id)
    return ReservaCreadaOut(**ReservaOut.model_validate(reserva).model_dump(), correo_confirmacion="pendiente")


@router.delete("/reservas/{reserva_id}", response_model=ReservaOut)
def cancelar(reserva_id: int, db: Session = Depends(get_db),
             admin: dict = Depends(get_current_admin)):
    return ReservaService(db).cancelar(reserva_id, admin["id"], admin["sub"])
