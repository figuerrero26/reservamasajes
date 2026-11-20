"""Actividades: el "tipo" de evento genérico (caminata, taller, competencia...). Ver
docstring de la migración 0009 para el porqué de este módulo paralelo a servicios/agendas.
"""
import json

from sqlalchemy.orm import Session

from app.models import Actividad
from app.repositories.actividad_repository import ActividadRepository
from app.repositories.sesion_repository import SesionRepository
from app.schemas.actividad import ActividadCreate, ActividadPublicaOut, ActividadUpdate, CampoFormulario
from app.services import auditoria_service
from app.services.errors import NotFound
from app.utils.time import now

CAMPOS_AUDITORIA = [
    "id", "nombre", "descripcion_corta", "informacion_adicional",
    "inscripcion_abierta", "fecha_apertura_inscripciones", "fecha_cierre_inscripciones", "activo",
]


def campos_formulario_de(actividad: Actividad) -> list[CampoFormulario]:
    """Deserializa `Actividad.campos_formulario` (JSON en texto) a objetos tipados. Nunca
    falla por datos corruptos: una actividad con el campo vacío/ilegible simplemente no pide
    datos adicionales al inscribirse."""
    if not actividad.campos_formulario:
        return []
    try:
        return [CampoFormulario(**c) for c in json.loads(actividad.campos_formulario)]
    except (ValueError, TypeError):
        return []


def inscripcion_disponible(actividad: Actividad) -> bool:
    """Evalúa junto el switch manual y la ventana automática (ambos opcionales e
    independientes, tal como se pidió: "habilitar/deshabilitar" + "apertura y cierre")."""
    if not actividad.activo or not actividad.inscripcion_abierta:
        return False
    momento = now().replace(tzinfo=None)
    if actividad.fecha_apertura_inscripciones and momento < actividad.fecha_apertura_inscripciones:
        return False
    if actividad.fecha_cierre_inscripciones and momento > actividad.fecha_cierre_inscripciones:
        return False
    return True


class ActividadService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = ActividadRepository(db)
        self.sesiones = SesionRepository(db)

    def listar_admin(self) -> list[Actividad]:
        return self.repo.list_all()

    def obtener(self, actividad_id: int) -> Actividad:
        actividad = self.repo.get(actividad_id)
        if not actividad:
            raise NotFound("Actividad no encontrada")
        return actividad

    def listar_publicas(self) -> list[ActividadPublicaOut]:
        """Catálogo del portal: solo actividades activas con al menos una sesión activa."""
        resultado = []
        for actividad in self.repo.list_activas():
            if not self.sesiones.por_actividad(actividad.id, solo_activas=True):
                continue
            resultado.append(ActividadPublicaOut(
                id=actividad.id, nombre=actividad.nombre,
                descripcion_corta=actividad.descripcion_corta, descripcion_larga=actividad.descripcion_larga,
                imagen_url=actividad.imagen_url, informacion_adicional=actividad.informacion_adicional,
                campos_formulario=campos_formulario_de(actividad),
                inscripcion_disponible=inscripcion_disponible(actividad),
            ))
        return resultado

    def obtener_publica(self, actividad_id: int) -> ActividadPublicaOut:
        actividad = self.obtener(actividad_id)
        if not actividad.activo:
            raise NotFound("Actividad no encontrada")
        return ActividadPublicaOut(
            id=actividad.id, nombre=actividad.nombre,
            descripcion_corta=actividad.descripcion_corta, descripcion_larga=actividad.descripcion_larga,
            imagen_url=actividad.imagen_url, informacion_adicional=actividad.informacion_adicional,
            campos_formulario=campos_formulario_de(actividad),
            inscripcion_disponible=inscripcion_disponible(actividad),
        )

    def crear(self, data: ActividadCreate, admin_id: int) -> Actividad:
        actividad = Actividad(
            nombre=data.nombre, descripcion_corta=data.descripcion_corta,
            descripcion_larga=data.descripcion_larga, imagen_url=data.imagen_url,
            informacion_adicional=data.informacion_adicional,
            campos_formulario=json.dumps([c.model_dump() for c in data.campos_formulario]),
            inscripcion_abierta=data.inscripcion_abierta,
            fecha_apertura_inscripciones=data.fecha_apertura_inscripciones,
            fecha_cierre_inscripciones=data.fecha_cierre_inscripciones,
        )
        self.db.add(actividad)
        self.db.flush()
        auditoria_service.registrar(
            self.db, admin_id, "crear", "actividad", actividad.id,
            datos_nuevos=auditoria_service.snapshot(actividad, CAMPOS_AUDITORIA),
        )
        self.db.commit()
        self.db.refresh(actividad)
        return actividad

    def actualizar(self, actividad_id: int, data: ActividadUpdate, admin_id: int) -> Actividad:
        actividad = self.obtener(actividad_id)
        anteriores = auditoria_service.snapshot(actividad, CAMPOS_AUDITORIA)
        cambios = data.model_dump(exclude_unset=True, exclude={"campos_formulario"})
        for k, v in cambios.items():
            setattr(actividad, k, v)
        if data.campos_formulario is not None:
            actividad.campos_formulario = json.dumps([c.model_dump() for c in data.campos_formulario])
        auditoria_service.registrar(
            self.db, admin_id, "editar", "actividad", actividad.id,
            datos_anteriores=anteriores, datos_nuevos=auditoria_service.snapshot(actividad, CAMPOS_AUDITORIA),
        )
        self.db.commit()
        self.db.refresh(actividad)
        return actividad

    def desactivar(self, actividad_id: int, admin_id: int) -> Actividad:
        actividad = self.obtener(actividad_id)
        anteriores = auditoria_service.snapshot(actividad, CAMPOS_AUDITORIA)
        actividad.activo = False
        auditoria_service.registrar(
            self.db, admin_id, "desactivar", "actividad", actividad_id,
            datos_anteriores=anteriores, datos_nuevos=auditoria_service.snapshot(actividad, CAMPOS_AUDITORIA),
        )
        self.db.commit()
        return actividad
