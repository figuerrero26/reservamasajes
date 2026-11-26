from fastapi import APIRouter, BackgroundTasks, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_current_admin_full, get_current_usuario
from app.database.session import get_db
from app.schemas.inscripcion import (
    CancelarInscripcionIn, InscripcionAdminOut, InscripcionCreate, InscripcionCreateManual, InscripcionOut,
    MiInscripcionOut,
)
from app.services.email_service import enviar_cancelacion_inscripcion, enviar_confirmacion_inscripcion
from app.services.inscripcion_service import InscripcionService

router = APIRouter(prefix="/inscripciones", tags=["inscripciones"])


# ---- Flujo público (requiere sesión de usuario) ----
@router.post("", response_model=InscripcionOut, status_code=status.HTTP_201_CREATED)
def crear(data: InscripcionCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db),
          usuario: dict = Depends(get_current_usuario)):
    servicio = InscripcionService(db)
    inscripcion = servicio.crear(data.sesion_id, data.respuestas, usuario["id"])
    # El correo se envía después del commit: un fallo de SMTP nunca revierte ni duplica la
    # inscripción (queda registrado en `notificaciones`).
    background_tasks.add_task(enviar_confirmacion_inscripcion, inscripcion.id)
    return servicio.a_out(inscripcion)


@router.get("/mias", response_model=list[MiInscripcionOut])
def mis_inscripciones(db: Session = Depends(get_db), usuario: dict = Depends(get_current_usuario)):
    return InscripcionService(db).mias(usuario["id"])


@router.post("/{inscripcion_id}/cancelar", response_model=InscripcionOut)
def cancelar_propia(inscripcion_id: int, db: Session = Depends(get_db),
                     usuario: dict = Depends(get_current_usuario)):
    servicio = InscripcionService(db)
    inscripcion = servicio.cancelar_propia(inscripcion_id, usuario["id"])
    return servicio.a_out(inscripcion)


# ---- Administración ----
@router.get("", response_model=list[InscripcionAdminOut])
def buscar(
    db: Session = Depends(get_db), _: dict = Depends(get_current_admin),
    nombre: str | None = None, correo: str | None = None,
    actividad_id: int | None = None, sesion_id: int | None = None, estado: str | None = None,
):
    return InscripcionService(db).buscar(
        nombre=nombre, correo=correo, actividad_id=actividad_id, sesion_id=sesion_id, estado=estado,
    )


@router.post("/manual", response_model=InscripcionOut, status_code=status.HTTP_201_CREATED)
def crear_manual(data: InscripcionCreateManual, background_tasks: BackgroundTasks, db: Session = Depends(get_db),
                  admin: dict = Depends(get_current_admin_full)):
    servicio = InscripcionService(db)
    inscripcion = servicio.crear_manual(data, admin["id"])
    background_tasks.add_task(enviar_confirmacion_inscripcion, inscripcion.id)
    return servicio.a_out(inscripcion)


@router.delete("/{inscripcion_id}", response_model=InscripcionOut)
def cancelar(inscripcion_id: int, background_tasks: BackgroundTasks,
             motivo: str | None = Query(default=None, max_length=500), notificar: bool = False,
             db: Session = Depends(get_db), admin: dict = Depends(get_current_admin_full)):
    servicio = InscripcionService(db)
    inscripcion = servicio.cancelar(inscripcion_id, admin["id"], admin["sub"], motivo)
    if notificar:
        background_tasks.add_task(enviar_cancelacion_inscripcion, inscripcion.id, motivo)
    return servicio.a_out(inscripcion)


@router.post("/{inscripcion_id}/cancelar-admin", response_model=InscripcionOut)
def cancelar_admin(inscripcion_id: int, data: CancelarInscripcionIn, background_tasks: BackgroundTasks,
                   db: Session = Depends(get_db), admin: dict = Depends(get_current_admin_full)):
    servicio = InscripcionService(db)
    inscripcion = servicio.cancelar(inscripcion_id, admin["id"], admin["sub"], data.motivo)
    if data.notificar:
        background_tasks.add_task(enviar_cancelacion_inscripcion, inscripcion.id, data.motivo)
    return servicio.a_out(inscripcion)


@router.delete("/{inscripcion_id}/cancelada", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_cancelada(inscripcion_id: int, db: Session = Depends(get_db),
                       admin: dict = Depends(get_current_admin_full)) -> None:
    InscripcionService(db).eliminar_cancelada(inscripcion_id, admin["id"])
