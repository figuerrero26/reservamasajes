from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_current_admin_full, get_current_usuario
from app.database.session import get_db
from app.schemas.reserva import (
    AgendaDia, CancelacionIn, CancelarLoteIn, CancelarLoteOut, HorariosResponse,
    MiReservaOut, ReservaAdminOut, ReservaCreadaOut, ReservaCreate, ReservaCreateManual, ReservaOut,
    VerificacionReservaOut,
)
from app.services.email_service import enviar_cancelacion_reserva, enviar_confirmacion_reserva
from app.services.horario_service import HorarioService
from app.services.reserva_service import ReservaService

router = APIRouter(tags=["reservas"])


# ---- Flujo público ----
@router.get("/agendas/{agenda_id}/horarios", response_model=HorariosResponse)
def horarios(agenda_id: int, fecha: date = Query(...), db: Session = Depends(get_db)):
    """Disponibilidad abierta (sin sesión): no expone datos personales, solo estados."""
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
    return ReservaCreadaOut(**ReservaOut.model_validate(reserva).model_dump())


@router.get("/reservas/verificar", response_model=VerificacionReservaOut)
def verificar_reserva(agenda_id: int, fecha: date = Query(...), db: Session = Depends(get_db),
                      usuario: dict = Depends(get_current_usuario)):
    """Antes de elegir un turno: ¿el colaborador puede reservar en este evento ese día?
    (vigencia del evento y límite de participación por persona)."""
    return ReservaService(db).verificar(usuario["id"], agenda_id, fecha)


@router.get("/reservas/mias", response_model=list[MiReservaOut])
def mis_reservas(db: Session = Depends(get_db), usuario: dict = Depends(get_current_usuario)):
    """Minimización de datos: solo las reservas del usuario autenticado, nunca de otro."""
    return ReservaService(db).mias(usuario["id"])


@router.post("/reservas/{reserva_id}/cancelar", response_model=ReservaOut)
def cancelar_propia(reserva_id: int, db: Session = Depends(get_db),
                     usuario: dict = Depends(get_current_usuario)):
    return ReservaService(db).cancelar_propia(reserva_id, usuario["id"])


# ---- Administración de reservas ----
@router.get("/reservas", response_model=list[ReservaAdminOut])
def buscar(
    db: Session = Depends(get_db), _: dict = Depends(get_current_admin),
    nombre: str | None = None, correo: str | None = None,
    fecha: date | None = None, agenda_id: int | None = None, servicio_id: int | None = None,
    estado: str | None = None,
):
    return ReservaService(db).buscar(
        nombre=nombre, correo=correo, fecha=fecha, agenda_id=agenda_id,
        servicio_id=servicio_id, estado=estado,
    )


@router.get("/reservas/dia", response_model=list[AgendaDia])
def dia(fecha: date = Query(...), servicio_id: int | None = None,
        db: Session = Depends(get_db), _: dict = Depends(get_current_admin)):
    """Vista "por día": todos los turnos de todas las agendas activas (disponibles y
    ocupados), sin importar área ni evento salvo que se filtre por evento."""
    return ReservaService(db).dia(fecha, servicio_id=servicio_id)


@router.post("/reservas/manual", response_model=ReservaCreadaOut, status_code=status.HTTP_201_CREATED)
def crear_reserva_manual(data: ReservaCreateManual, background_tasks: BackgroundTasks,
                          db: Session = Depends(get_db), admin: dict = Depends(get_current_admin_full)):
    reserva = ReservaService(db).crear_manual(data, admin["id"])
    background_tasks.add_task(enviar_confirmacion_reserva, reserva.id)
    return ReservaCreadaOut(**ReservaOut.model_validate(reserva).model_dump())


@router.post("/reservas/cancelar-lote", response_model=CancelarLoteOut)
def cancelar_lote(data: CancelarLoteIn, background_tasks: BackgroundTasks,
                  db: Session = Depends(get_db), admin: dict = Depends(get_current_admin_full)):
    """Cancela, con confirmación explícita del administrador, un grupo de reservas (p. ej.
    las afectadas por un bloqueo o festivo) y notifica a cada colaborador si se pide."""
    canceladas, omitidas = ReservaService(db).cancelar_lote(data.reserva_ids, admin["id"], admin["sub"], data.motivo)
    if data.notificar:
        for rid in canceladas:
            background_tasks.add_task(enviar_cancelacion_reserva, rid, data.motivo)
    return CancelarLoteOut(canceladas=canceladas, omitidas=omitidas)


@router.delete("/reservas/{reserva_id}", response_model=ReservaOut)
def cancelar(reserva_id: int, background_tasks: BackgroundTasks,
             motivo: str | None = Query(default=None, max_length=500), notificar: bool = False,
             db: Session = Depends(get_db), admin: dict = Depends(get_current_admin_full)):
    reserva = ReservaService(db).cancelar(reserva_id, admin["id"], admin["sub"], motivo)
    if notificar:
        background_tasks.add_task(enviar_cancelacion_reserva, reserva.id, motivo)
    return reserva


@router.post("/reservas/{reserva_id}/cancelar-admin", response_model=ReservaOut)
def cancelar_admin(reserva_id: int, data: CancelacionIn, background_tasks: BackgroundTasks,
                   db: Session = Depends(get_db), admin: dict = Depends(get_current_admin_full)):
    """Igual que DELETE /reservas/{id}, con el motivo y la notificación en el cuerpo."""
    reserva = ReservaService(db).cancelar(reserva_id, admin["id"], admin["sub"], data.motivo)
    if data.notificar:
        background_tasks.add_task(enviar_cancelacion_reserva, reserva.id, data.motivo)
    return reserva


@router.delete("/reservas/{reserva_id}/cancelada", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_cancelada(reserva_id: int, db: Session = Depends(get_db),
                       admin: dict = Depends(get_current_admin_full)) -> None:
    ReservaService(db).eliminar_cancelada(reserva_id, admin["id"])
