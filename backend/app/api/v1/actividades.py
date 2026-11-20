from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_current_admin_full
from app.database.session import get_db
from app.schemas.actividad import ActividadCreate, ActividadOut, ActividadPublicaOut, ActividadUpdate
from app.schemas.sesion import GenerarSesionesIn, SesionCreate, SesionOut, SesionUpdate
from app.services.actividad_service import ActividadService, campos_formulario_de
from app.services.sesion_service import SesionService

router = APIRouter(prefix="/actividades", tags=["actividades"])


def _a_out(actividad) -> ActividadOut:
    return ActividadOut(
        id=actividad.id, nombre=actividad.nombre, descripcion_corta=actividad.descripcion_corta,
        descripcion_larga=actividad.descripcion_larga, imagen_url=actividad.imagen_url,
        informacion_adicional=actividad.informacion_adicional,
        campos_formulario=campos_formulario_de(actividad),
        inscripcion_abierta=actividad.inscripcion_abierta,
        fecha_apertura_inscripciones=actividad.fecha_apertura_inscripciones,
        fecha_cierre_inscripciones=actividad.fecha_cierre_inscripciones,
        activo=actividad.activo,
    )


# ---- Flujo público (sin autenticación) ----
@router.get("/publicas", response_model=list[ActividadPublicaOut])
def listar_publicas(db: Session = Depends(get_db)):
    return ActividadService(db).listar_publicas()


@router.get("/publicas/{actividad_id}", response_model=ActividadPublicaOut)
def obtener_publica(actividad_id: int, db: Session = Depends(get_db)):
    return ActividadService(db).obtener_publica(actividad_id)


@router.get("/publicas/{actividad_id}/sesiones", response_model=list[SesionOut])
def listar_sesiones_publicas(actividad_id: int, db: Session = Depends(get_db)):
    return SesionService(db).listar(actividad_id, solo_activas=True, solo_futuras=True)


# ---- Administración ----
@router.get("", response_model=list[ActividadOut])
def listar(db: Session = Depends(get_db), _: dict = Depends(get_current_admin)):
    return [_a_out(a) for a in ActividadService(db).listar_admin()]


@router.get("/{actividad_id}", response_model=ActividadOut)
def obtener(actividad_id: int, db: Session = Depends(get_db), _: dict = Depends(get_current_admin)):
    return _a_out(ActividadService(db).obtener(actividad_id))


@router.post("", response_model=ActividadOut, status_code=status.HTTP_201_CREATED)
def crear(data: ActividadCreate, db: Session = Depends(get_db),
          admin: dict = Depends(get_current_admin_full)):
    return _a_out(ActividadService(db).crear(data, admin["id"]))


@router.put("/{actividad_id}", response_model=ActividadOut)
def actualizar(actividad_id: int, data: ActividadUpdate, db: Session = Depends(get_db),
               admin: dict = Depends(get_current_admin_full)):
    return _a_out(ActividadService(db).actualizar(actividad_id, data, admin["id"]))


@router.post("/{actividad_id}/desactivar", response_model=ActividadOut)
def desactivar(actividad_id: int, db: Session = Depends(get_db),
                admin: dict = Depends(get_current_admin_full)):
    return _a_out(ActividadService(db).desactivar(actividad_id, admin["id"]))


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
