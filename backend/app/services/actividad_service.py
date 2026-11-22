"""Actividades: el "tipo" de evento con inscripción y cupo (caminata, taller, competencia…).

A diferencia de las reservas por turnos (Servicio/Agenda/Reserva), aquí no se agendan
horarios individuales: cada actividad tiene una o varias sesiones con fecha, hora y cupo, y
los colaboradores se inscriben. Ver docstring de la migración 0009.

Este módulo centraliza la evaluación de ESTADOS (de la actividad y de cada sesión), para que
el portal, el panel y la propia inscripción usen exactamente la misma regla.
"""
import json
from typing import Literal

from sqlalchemy.orm import Session

from app.models import Actividad, Sesion
from app.repositories.actividad_repository import ActividadRepository
from app.repositories.inscripcion_repository import InscripcionRepository
from app.repositories.sesion_repository import SesionRepository
from app.schemas.actividad import (
    ActividadCreate, ActividadOut, ActividadPublicaOut, ActividadUpdate, CampoFormulario, EstadoActividad,
    ResumenSesiones,
)
from app.services import auditoria_service
from app.services.errors import DomainError, NotFound
from app.utils.time import now, ya_empezo

CAMPOS_AUDITORIA = [
    "id", "nombre", "descripcion_corta", "informacion_adicional",
    "inscripcion_abierta", "fecha_apertura_inscripciones", "fecha_cierre_inscripciones", "activo",
]
NO_NULOS = {"nombre", "inscripcion_abierta", "activo"}

Ventana = Literal["abierta", "proximamente", "cerrada"]


def campos_formulario_de(actividad: Actividad) -> list[CampoFormulario]:
    """Deserializa `Actividad.campos_formulario` (JSON en texto). Tolerante: una pregunta
    ilegible se omite sin perder las demás, y un JSON corrupto equivale a no pedir datos."""
    if not actividad.campos_formulario:
        return []
    try:
        crudos = json.loads(actividad.campos_formulario)
    except (ValueError, TypeError):
        return []
    campos = []
    for crudo in crudos if isinstance(crudos, list) else []:
        try:
            campos.append(CampoFormulario.model_validate(crudo))
        except ValueError:
            continue
    return campos


def ventana_inscripcion(actividad: Actividad) -> Ventana:
    """Switch manual + ventana automática de fechas (ambos opcionales e independientes)."""
    if not actividad.activo or not actividad.inscripcion_abierta:
        return "cerrada"
    momento = now().replace(tzinfo=None)  # las columnas DATETIME guardan hora local sin zona
    if actividad.fecha_apertura_inscripciones and momento < actividad.fecha_apertura_inscripciones:
        return "proximamente"
    if actividad.fecha_cierre_inscripciones and momento > actividad.fecha_cierre_inscripciones:
        return "cerrada"
    return "abierta"


def inscripcion_disponible(actividad: Actividad) -> bool:
    return ventana_inscripcion(actividad) == "abierta"


def sesion_llena(sesion: Sesion, inscritos: int) -> bool:
    return sesion.cupo_maximo is not None and inscritos >= sesion.cupo_maximo


def estado_sesion(sesion: Sesion, inscritos: int, ventana: Ventana) -> str:
    if ya_empezo(sesion.fecha, sesion.hora_inicio):
        return "finalizada"
    if not sesion.activa:
        return "inactiva"
    if sesion_llena(sesion, inscritos):
        return "cupo_lleno"
    if ventana != "abierta":
        return "cerrada"
    return "disponible"


def evaluar_actividad(actividad: Actividad, futuras: list[Sesion], inscritos: dict[int, int]) -> tuple[EstadoActividad, ResumenSesiones]:
    """Estado de inscripción y resumen a partir de las sesiones FUTURAS y ACTIVAS."""
    if not futuras:
        return "finalizada", ResumenSesiones()
    proxima = futuras[0]
    con_cupo = [s for s in futuras if not sesion_llena(s, inscritos.get(s.id, 0))]
    sin_limite = any(s.cupo_maximo is None for s in futuras)
    resumen = ResumenSesiones(
        sesiones_futuras=len(futuras),
        proxima_fecha=proxima.fecha, proxima_hora_inicio=proxima.hora_inicio,
        proxima_hora_fin=proxima.hora_fin, proximo_lugar=proxima.lugar,
        inscritos_futuros=sum(inscritos.get(s.id, 0) for s in futuras),
        cupos_disponibles=None if sin_limite else sum(
            max(0, s.cupo_maximo - inscritos.get(s.id, 0)) for s in futuras
        ),
    )
    ventana = ventana_inscripcion(actividad)
    if ventana != "abierta":
        return ventana, resumen
    if not con_cupo:
        return "agotada", resumen
    return "abierta", resumen


class ActividadService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = ActividadRepository(db)
        self.sesiones = SesionRepository(db)
        self.inscripciones = InscripcionRepository(db)

    def _evaluar_varias(self, actividades: list[Actividad]) -> dict[int, tuple[EstadoActividad, ResumenSesiones]]:
        """Estados de varias actividades con dos consultas en total (sesiones y conteos)."""
        futuras = self.sesiones.futuras_activas_por_actividades([a.id for a in actividades])
        ids_sesiones = [s.id for lista in futuras.values() for s in lista]
        inscritos = self.inscripciones.contar_activas_por_sesiones(ids_sesiones)
        return {a.id: evaluar_actividad(a, futuras.get(a.id, []), inscritos) for a in actividades}

    def a_out(self, actividad: Actividad, evaluacion=None) -> ActividadOut:
        estado, resumen = evaluacion or self._evaluar_varias([actividad])[actividad.id]
        return ActividadOut(
            id=actividad.id, nombre=actividad.nombre, descripcion_corta=actividad.descripcion_corta,
            descripcion_larga=actividad.descripcion_larga, imagen_url=actividad.imagen_url,
            informacion_adicional=actividad.informacion_adicional,
            campos_formulario=campos_formulario_de(actividad),
            inscripcion_abierta=actividad.inscripcion_abierta,
            fecha_apertura_inscripciones=actividad.fecha_apertura_inscripciones,
            fecha_cierre_inscripciones=actividad.fecha_cierre_inscripciones,
            activo=actividad.activo, estado_inscripcion=estado, resumen=resumen,
        )

    @staticmethod
    def _a_publica(actividad: Actividad, estado: EstadoActividad, resumen: ResumenSesiones) -> ActividadPublicaOut:
        return ActividadPublicaOut(
            id=actividad.id, nombre=actividad.nombre,
            descripcion_corta=actividad.descripcion_corta, descripcion_larga=actividad.descripcion_larga,
            imagen_url=actividad.imagen_url, informacion_adicional=actividad.informacion_adicional,
            campos_formulario=campos_formulario_de(actividad),
            inscripcion_disponible=estado == "abierta", estado_inscripcion=estado,
            fecha_apertura_inscripciones=actividad.fecha_apertura_inscripciones,
            fecha_cierre_inscripciones=actividad.fecha_cierre_inscripciones,
            resumen=resumen,
        )

    def listar_admin(self) -> list[ActividadOut]:
        actividades = self.repo.list_all()
        evaluaciones = self._evaluar_varias(actividades)
        return [self.a_out(a, evaluaciones[a.id]) for a in actividades]

    def obtener(self, actividad_id: int) -> Actividad:
        actividad = self.repo.get(actividad_id)
        if not actividad:
            raise NotFound("Actividad no encontrada")
        return actividad

    def listar_publicas(self) -> list[ActividadPublicaOut]:
        """Catálogo del portal: actividades activas con al menos una sesión FUTURA activa
        (una actividad cuyas sesiones ya pasaron todas no se sigue anunciando)."""
        actividades = self.repo.list_activas()
        evaluaciones = self._evaluar_varias(actividades)
        return [
            self._a_publica(a, *evaluaciones[a.id])
            for a in actividades if evaluaciones[a.id][0] != "finalizada"
        ]

    def obtener_publica(self, actividad_id: int) -> ActividadPublicaOut:
        actividad = self.obtener(actividad_id)
        if not actividad.activo:
            raise NotFound("Actividad no encontrada")
        return self._a_publica(actividad, *self._evaluar_varias([actividad])[actividad.id])

    def crear(self, data: ActividadCreate, admin_id: int) -> Actividad:
        actividad = Actividad(
            nombre=data.nombre, descripcion_corta=data.descripcion_corta,
            descripcion_larga=data.descripcion_larga, imagen_url=data.imagen_url,
            informacion_adicional=data.informacion_adicional,
            campos_formulario=json.dumps([c.model_dump() for c in data.campos_formulario], ensure_ascii=False),
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
        cambios = data.model_dump(exclude_unset=True, exclude={"campos_formulario"})
        nulos = sorted(k for k, v in cambios.items() if v is None and k in NO_NULOS)
        if nulos:
            raise DomainError(f"Estos campos no pueden quedar vacíos: {', '.join(nulos)}")
        apertura = cambios.get("fecha_apertura_inscripciones", actividad.fecha_apertura_inscripciones)
        cierre = cambios.get("fecha_cierre_inscripciones", actividad.fecha_cierre_inscripciones)
        if apertura and cierre and cierre <= apertura:
            raise DomainError("El cierre de inscripciones debe ser posterior a la apertura")

        anteriores = auditoria_service.snapshot(actividad, CAMPOS_AUDITORIA)
        for k, v in cambios.items():
            setattr(actividad, k, v)
        if data.campos_formulario is not None:
            actividad.campos_formulario = json.dumps(
                [c.model_dump() for c in data.campos_formulario], ensure_ascii=False,
            )
        auditoria_service.registrar(
            self.db, admin_id, "editar", "actividad", actividad.id,
            datos_anteriores=anteriores, datos_nuevos=auditoria_service.snapshot(actividad, CAMPOS_AUDITORIA),
        )
        self.db.commit()
        self.db.refresh(actividad)
        return actividad

    def cambiar_estado(self, actividad_id: int, activo: bool, admin_id: int) -> Actividad:
        """Desactivar oculta la actividad del portal y cierra las inscripciones. Las
        inscripciones existentes se conservan (el resumen las informa en el panel)."""
        actividad = self.obtener(actividad_id)
        anteriores = auditoria_service.snapshot(actividad, CAMPOS_AUDITORIA)
        actividad.activo = activo
        auditoria_service.registrar(
            self.db, admin_id, "activar" if activo else "desactivar", "actividad", actividad_id,
            datos_anteriores=anteriores, datos_nuevos=auditoria_service.snapshot(actividad, CAMPOS_AUDITORIA),
        )
        self.db.commit()
        return actividad
