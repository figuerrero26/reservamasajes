"""Actividades: el "tipo" de evento con inscripción y cupo (caminata, taller, competencia…).

A diferencia de las reservas por turnos (Servicio/Agenda/Reserva), aquí no se agendan
horarios individuales: cada actividad tiene una o varias sesiones con fecha, hora y cupo, y
los colaboradores se inscriben. Ver docstring de la migración 0009.

Cada actividad pertenece a un área (obligatoria desde la migración 0011). Igual que con los
eventos por turnos, un área inactiva retira sus actividades del portal y cierra sus
inscripciones; las inscripciones existentes se conservan.

Este módulo centraliza la evaluación de ESTADOS (de la actividad y de cada sesión), para que
el portal, el panel y la propia inscripción usen exactamente la misma regla.
"""
import json
from typing import Literal

from sqlalchemy.orm import Session

from app.models import Actividad, Sesion
from app.repositories.actividad_repository import ActividadRepository
from app.repositories.area_repository import AreaRepository
from app.repositories.inscripcion_repository import InscripcionRepository
from app.repositories.sesion_repository import SesionRepository
from app.schemas.actividad import (
    ActividadCreate, ActividadOut, ActividadPublicaOut, ActividadUpdate, CampoFormulario, EstadoActividad,
    ResumenSesiones,
)
from app.schemas.sesion import SesionCreate
from app.services import auditoria_service
from app.services.errors import DomainError, NotFound
from app.utils.time import now, ya_empezo

CAMPOS_AUDITORIA = [
    "id", "area_id", "nombre", "descripcion_corta", "informacion_adicional",
    "inscripcion_abierta", "fecha_apertura_inscripciones", "fecha_cierre_inscripciones", "activo",
]
CAMPOS_AUDITORIA_SESION = ["id", "actividad_id", "fecha", "hora_inicio", "hora_fin", "cupo_maximo", "lugar", "activa"]
NO_NULOS = {"area_id", "nombre", "inscripcion_abierta", "activo"}

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


def actividad_disponible(actividad: Actividad) -> bool:
    """La actividad se publica y acepta inscripciones solo si ella y su área están activas
    (las actividades antiguas sin área dependen solo de su propio estado)."""
    return bool(actividad.activo and (actividad.area is None or actividad.area.activo))


def ventana_inscripcion(actividad: Actividad) -> Ventana:
    """Switch manual + ventana automática de fechas (ambos opcionales e independientes)."""
    if not actividad_disponible(actividad) or not actividad.inscripcion_abierta:
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


def construir_sesion(repo: SesionRepository, actividad_id: int, data: SesionCreate,
                     ya_en_lote: set | None = None) -> Sesion:
    """Valida y construye (sin guardar) una sesión: no en el pasado y sin repetir fecha y
    hora dentro de la actividad. Compartida por la creación de sesiones sueltas y por las
    sesiones iniciales de una actividad nueva."""
    if ya_empezo(data.fecha, data.hora_inicio):
        raise DomainError("No se puede crear una sesión en una fecha u hora que ya pasó.")
    clave = (data.fecha, data.hora_inicio)
    if (ya_en_lote is not None and clave in ya_en_lote) or repo.existe(actividad_id, data.fecha, data.hora_inicio):
        raise DomainError(f"Hay dos sesiones el {data.fecha.isoformat()} a las {data.hora_inicio.strftime('%H:%M')}.")
    if ya_en_lote is not None:
        ya_en_lote.add(clave)
    return Sesion(
        actividad_id=actividad_id, fecha=data.fecha, hora_inicio=data.hora_inicio,
        hora_fin=data.hora_fin, cupo_maximo=data.cupo_maximo, lugar=data.lugar,
    )


class ActividadService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = ActividadRepository(db)
        self.areas = AreaRepository(db)
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
            id=actividad.id, area_id=actividad.area_id,
            area_nombre=actividad.area.nombre if actividad.area else None,
            nombre=actividad.nombre, descripcion_corta=actividad.descripcion_corta,
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
            id=actividad.id, area_id=actividad.area_id,
            area_nombre=actividad.area.nombre if actividad.area else None,
            nombre=actividad.nombre,
            descripcion_corta=actividad.descripcion_corta, descripcion_larga=actividad.descripcion_larga,
            imagen_url=actividad.imagen_url, informacion_adicional=actividad.informacion_adicional,
            campos_formulario=campos_formulario_de(actividad),
            inscripcion_disponible=estado == "abierta", estado_inscripcion=estado,
            fecha_apertura_inscripciones=actividad.fecha_apertura_inscripciones,
            fecha_cierre_inscripciones=actividad.fecha_cierre_inscripciones,
            resumen=resumen,
        )

    def listar_admin(self, area_id: int | None = None) -> list[ActividadOut]:
        actividades = self.repo.list_all(area_id=area_id)
        evaluaciones = self._evaluar_varias(actividades)
        return [self.a_out(a, evaluaciones[a.id]) for a in actividades]

    def obtener(self, actividad_id: int) -> Actividad:
        actividad = self.repo.get(actividad_id)
        if not actividad:
            raise NotFound("Actividad no encontrada")
        return actividad

    def listar_publicas(self, area_id: int | None = None) -> list[ActividadPublicaOut]:
        """Catálogo del portal: actividades disponibles (ellas y su área activas) con al
        menos una sesión FUTURA activa."""
        actividades = [a for a in self.repo.list_activas(area_id=area_id) if actividad_disponible(a)]
        evaluaciones = self._evaluar_varias(actividades)
        return [
            self._a_publica(a, *evaluaciones[a.id])
            for a in actividades if evaluaciones[a.id][0] != "finalizada"
        ]

    def obtener_publica(self, actividad_id: int) -> ActividadPublicaOut:
        actividad = self.obtener(actividad_id)
        if not actividad_disponible(actividad):
            raise NotFound("Actividad no encontrada")
        return self._a_publica(actividad, *self._evaluar_varias([actividad])[actividad.id])

    def _validar_area(self, area_id: int) -> None:
        area = self.areas.get(area_id)
        if not area or not area.activo:
            raise DomainError("Selecciona un área activa para la actividad.")

    def crear(self, data: ActividadCreate, admin_id: int) -> Actividad:
        self._validar_area(data.area_id)
        actividad = Actividad(
            area_id=data.area_id,
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

        # Sesiones iniciales: misma transacción; una inválida cancela todo (nada a medias).
        en_lote: set = set()
        sesiones = [construir_sesion(self.sesiones, actividad.id, s, en_lote) for s in data.sesiones]
        if sesiones:
            self.sesiones.crear_lote(sesiones)

        auditoria_service.registrar(
            self.db, admin_id, "crear", "actividad", actividad.id,
            datos_nuevos={**auditoria_service.snapshot(actividad, CAMPOS_AUDITORIA), "sesiones_iniciales": len(sesiones)},
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
        if "area_id" in cambios and cambios["area_id"] != actividad.area_id:
            self._validar_area(cambios["area_id"])
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
        if activo and actividad.area_id is None:
            raise DomainError("Asigna un área a la actividad antes de publicarla.")
        anteriores = auditoria_service.snapshot(actividad, CAMPOS_AUDITORIA)
        actividad.activo = activo
        auditoria_service.registrar(
            self.db, admin_id, "activar" if activo else "desactivar", "actividad", actividad_id,
            datos_anteriores=anteriores, datos_nuevos=auditoria_service.snapshot(actividad, CAMPOS_AUDITORIA),
        )
        self.db.commit()
        return actividad
