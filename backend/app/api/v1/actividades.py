from typing import Literal

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_current_admin_full, get_usuario_opcional
from app.database.session import get_db
from app.schemas.actividad import ActividadCreate, ActividadOut, ActividadPublicaOut, ActividadUpdate
from app.schemas.sesion import GenerarSesionesIn, SesionCreate, SesionOut, SesionUpdate
from app.services.actividad_service import ActividadService
from app.services.sesion_service import SesionService

router = APIRouter(prefix="/actividades", tags=["actividades"])


# ---- Flujo público (sin autenticación; con sesión muestra si ya está inscrito) ----
@router.get("/publicas", response_model=list[ActividadPublicaOut])
def listar_publicas(area_id: int | None = None, db: Session = Depends(get_db)):
    return ActividadService(db).listar_publicas(area_id=area_id)


@router.get("/publicas/{actividad_id}", response_model=ActividadPublicaOut)
def obtener_publica(actividad_id: int, db: Session = Depends(get_db)):
    return ActividadService(db).obtener_publica(actividad_id)


@router.get("/publicas/{actividad_id}/sesiones", response_model=list[SesionOut])
def listar_sesiones_publicas(actividad_id: int, db: Session = Depends(get_db),
                             usuario: dict | None = Depends(get_usuario_opcional)):
    return SesionService(db).listar_publicas(actividad_id, usuario_id=usuario["id"] if usuario else None)


# ---- Administración ----
@router.get("", response_model=list[ActividadOut])
def listar(area_id: int | None = None,
           estado: Literal["vigente", "proximo", "finalizado", "sin_vigencia"] | None = None,
           db: Session = Depends(get_db), _: dict = Depends(get_current_admin)):
    """Con `estado`: solo las actividades en ese estado de vigencia (las finalizadas
    conservan sus sesiones e inscripciones, consultables en GET /inscripciones?actividad_id=…)."""
    return ActividadService(db).listar_admin(area_id=area_id, estado=estado)


@router.get("/{actividad_id}", response_model=ActividadOut)
def obtener(actividad_id: int, db: Session = Depends(get_db), _: dict = Depends(get_current_admin)):
    servicio = ActividadService(db)
    return servicio.a_out(servicio.obtener(actividad_id))


@router.post("", response_model=ActividadOut, status_code=status.HTTP_201_CREATED)
def crear(data: ActividadCreate, db: Session = Depends(get_db),
          admin: dict = Depends(get_current_admin_full)):
    servicio = ActividadService(db)
    return servicio.a_out(servicio.crear(data, admin["id"]))


@router.put("/{actividad_id}", response_model=ActividadOut)
def actualizar(actividad_id: int, data: ActividadUpdate, db: Session = Depends(get_db),
               admin: dict = Depends(get_current_admin_full)):
    servicio = ActividadService(db)
    return servicio.a_out(servicio.actualizar(actividad_id, data, admin["id"]))


@router.post("/{actividad_id}/desactivar", response_model=ActividadOut)
def desactivar(actividad_id: int, db: Session = Depends(get_db),
                admin: dict = Depends(get_current_admin_full)):
    servicio = ActividadService(db)
    return servicio.a_out(servicio.cambiar_estado(actividad_id, False, admin["id"]))


@router.post("/{actividad_id}/activar", response_model=ActividadOut)
def activar(actividad_id: int, db: Session = Depends(get_db),
            admin: dict = Depends(get_current_admin_full)):
    servicio = ActividadService(db)
    return servicio.a_out(servicio.cambiar_estado(actividad_id, True, admin["id"]))


@router.get("/{actividad_id}/sesiones", response_model=list[SesionOut])
def listar_sesiones(actividad_id: int, db: Session = Depends(get_db),
                     _: dict = Depends(get_current_admin)):
    return SesionService(db).listar(actividad_id)


@router.post("/{actividad_id}/sesiones", response_model=SesionOut, status_code=status.HTTP_201_CREATED)
def crear_sesion(actividad_id: int, data: SesionCreate, db: Session = Depends(get_db),
                  admin: dict = Depends(get_current_admin_full)):
    return SesionService(db).crear(actividad_id, data, admin["id"])


@router.post("/{actividad_id}/sesiones/generar", response_model=list[SesionOut])
def generar_sesiones(actividad_id: int, data: GenerarSesionesIn, db: Session = Depends(get_db),
                      admin: dict = Depends(get_current_admin_full)):
    return SesionService(db).generar_lote(actividad_id, data, admin["id"])


@router.put("/sesiones/{sesion_id}", response_model=SesionOut)
def actualizar_sesion(sesion_id: int, data: SesionUpdate, db: Session = Depends(get_db),
                       admin: dict = Depends(get_current_admin_full)):
    return SesionService(db).actualizar(sesion_id, data, admin["id"])


@router.post("/sesiones/{sesion_id}/desactivar", response_model=SesionOut)
def desactivar_sesion(sesion_id: int, db: Session = Depends(get_db),
                       admin: dict = Depends(get_current_admin_full)):
    return SesionService(db).desactivar(sesion_id, admin["id"])
