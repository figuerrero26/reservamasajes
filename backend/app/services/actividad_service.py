"""Actividades: el "tipo" de evento con inscripción y cupo (caminata, taller, competencia…).

A diferencia de las reservas por turnos (Servicio/Agenda/Reserva), aquí no se agendan
horarios individuales: cada actividad tiene una o varias sesiones con fecha, hora y cupo, y
los colaboradores se inscriben. Ver docstring de la migración 0009.

Cada actividad pertenece a un área (obligatoria desde la migración 0011). Igual que con los
eventos por turnos, un área inactiva retira sus actividades del portal y cierra sus
inscripciones; las inscripciones existentes se conservan.

Este módulo centraliza la evaluación de ESTADOS (de la actividad y de cada sesión), para que
el portal, el panel y la propia inscripción usen exactamente la misma regla.

Vigencia (ver app/utils/vigencia.py): la actividad se publica y recibe inscripciones solo
dentro de su periodo. Las sesiones no pueden ser anteriores al inicio de la vigencia (nadie
podría inscribirse); sí pueden ser posteriores al fin: en ese caso las inscripciones cierran
al terminar la vigencia y la sesión se realiza con quienes ya estaban inscritos.
"""
import json
from datetime import date
from typing import Literal

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import Actividad, Inscripcion, Sesion
from app.repositories.actividad_repository import ActividadRepository
from app.repositories.area_repository import AreaRepository
from app.repositories.inscripcion_repository import InscripcionRepository
from app.repositories.sesion_repository import SesionRepository
from app.schemas.actividad import (
    ActividadCreate, ActividadOut, ActividadPublicaOut, ActividadUpdate, CampoFormulario, EstadoActividad,
    ResumenSesiones, describir_regla_inscripcion,
)
from app.schemas.sesion import SesionCreate
from app.schemas.vigencia import validar_rango_vigencia
from app.services import auditoria_service
from app.services.errors import DomainError, NotFound
from app.utils.time import now, ya_empezo
from app.utils.vigencia import estado_vigencia, formato_fecha, motivo_fuera_de_vigencia

CAMPOS_AUDITORIA = [
    "id", "area_id", "nombre", "descripcion_corta", "informacion_adicional", "imagen_url",
    "inscripcion_abierta", "activo", "vigencia_inicio", "vigencia_fin",
    "limite_participaciones", "periodo_limite",
]
CAMPOS_AUDITORIA_SESION = ["id", "actividad_id", "fecha", "hora_inicio", "hora_fin", "cupo_maximo", "lugar", "activa"]
NO_NULOS = {"area_id", "nombre", "inscripcion_abierta", "activo", "vigencia_inicio", "vigencia_fin", "periodo_limite"}

Ventana = Literal["abierta", "proximamente", "cerrada", "finalizada"]


def _hoy() -> date:
    return now().date()


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


def motivo_actividad_no_disponible(actividad: Actividad) -> str | None:
    """None si la actividad se publica y acepta inscripciones hoy; si no, el motivo. Ella y
    su área deben estar activas (las actividades antiguas sin área dependen solo de su
    propio estado) y el evento debe estar dentro de su vigencia."""
    if not (actividad.activo and (actividad.area is None or actividad.area.activo)):
        return "La actividad no está disponible."
    return motivo_fuera_de_vigencia(actividad.vigencia_inicio, actividad.vigencia_fin, _hoy(), "inscripciones")


def actividad_disponible(actividad: Actividad) -> bool:
    return motivo_actividad_no_disponible(actividad) is None


def ventana_inscripcion(actividad: Actividad) -> Ventana:
    """Estado de las inscripciones de la actividad hoy: vigencia del evento + switch manual."""
    if not (actividad.activo and (actividad.area is None or actividad.area.activo)):
        return "cerrada"
    estado = estado_vigencia(actividad.vigencia_inicio, actividad.vigencia_fin, _hoy())
    if estado == "proximo":
        return "proximamente"
    if estado == "finalizado":
        return "finalizada"
    return "abierta" if actividad.inscripcion_abierta else "cerrada"


def validar_sesion_en_vigencia(actividad: Actividad, fecha: date) -> None:
    """Una sesión anterior al inicio de la vigencia nunca podría recibir inscripciones."""
    if actividad.vigencia_inicio and fecha < actividad.vigencia_inicio:
        raise DomainError(
            f"La sesión del {formato_fecha(fecha)} es anterior al inicio de la vigencia del evento "
            f"({formato_fecha(actividad.vigencia_inicio)})."
        )


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
    """Estado de inscripción y resumen a partir de las sesiones FUTURAS y ACTIVAS. El
    resumen se calcula siempre (también para un evento finalizado, cuyas sesiones futuras
    se realizan con quienes ya estaban inscritos)."""
    ventana = ventana_inscripcion(actividad)
    if not futuras:
        return ("proximamente" if ventana == "proximamente" else "finalizada"), ResumenSesiones()
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
    if ventana != "abierta":
        return ventana, resumen
    if not con_cupo:
        return "agotada", resumen
    return "abierta", resumen


def construir_sesion(repo: SesionRepository, actividad: Actividad, data: SesionCreate,
                     ya_en_lote: set | None = None) -> Sesion:
    """Valida y construye (sin guardar) una sesión: no en el pasado, no antes del inicio de
    la vigencia y sin repetir fecha y hora dentro de la actividad. Compartida por la creación
    de sesiones sueltas y por las sesiones iniciales de una actividad nueva."""
    if ya_empezo(data.fecha, data.hora_inicio):
        raise DomainError("No se puede crear una sesión en una fecha u hora que ya pasó.")
    validar_sesion_en_vigencia(actividad, data.fecha)
    clave = (data.fecha, data.hora_inicio)
    if (ya_en_lote is not None and clave in ya_en_lote) or repo.existe(actividad.id, data.fecha, data.hora_inicio):
        raise DomainError(f"Hay dos sesiones el {data.fecha.isoformat()} a las {data.hora_inicio.strftime('%H:%M')}.")
    if ya_en_lote is not None:
        ya_en_lote.add(clave)
    return Sesion(
        actividad_id=actividad.id, fecha=data.fecha, hora_inicio=data.hora_inicio,
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
            activo=actividad.activo,
            vigencia_inicio=actividad.vigencia_inicio, vigencia_fin=actividad.vigencia_fin,
            finalizado_en=actividad.finalizado_en,
            estado_vigencia=estado_vigencia(actividad.vigencia_inicio, actividad.vigencia_fin, _hoy()),
            limite_participaciones=actividad.limite_participaciones, periodo_limite=actividad.periodo_limite,
            estado_inscripcion=estado, resumen=resumen,
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
            vigencia_inicio=actividad.vigencia_inicio, vigencia_fin=actividad.vigencia_fin,
            regla_participacion=describir_regla_inscripcion(actividad.limite_participaciones, actividad.periodo_limite),
            resumen=resumen,
        )

    def listar_admin(self, area_id: int | None = None, estado: str | None = None) -> list[ActividadOut]:
        """`estado` filtra por vigencia: vigente, proximo, finalizado o sin_vigencia."""
        actividades = self.repo.list_all(area_id=area_id)
        if estado:
            hoy = _hoy()
            actividades = [
                a for a in actividades if estado_vigencia(a.vigencia_inicio, a.vigencia_fin, hoy) == estado
            ]
        evaluaciones = self._evaluar_varias(actividades)
        return [self.a_out(a, evaluaciones[a.id]) for a in actividades]

    def obtener(self, actividad_id: int) -> Actividad:
        actividad = self.repo.get(actividad_id)
        if not actividad:
            raise NotFound("Actividad no encontrada")
        return actividad

    def listar_publicas(self, area_id: int | None = None) -> list[ActividadPublicaOut]:
        """Catálogo del portal: actividades disponibles (ellas y su área activas, dentro de
        su vigencia) con al menos una sesión FUTURA activa."""
        actividades = [a for a in self.repo.list_activas(area_id=area_id) if actividad_disponible(a)]
        evaluaciones = self._evaluar_varias(actividades)
        return [
            self._a_publica(a, *evaluaciones[a.id])
            for a in actividades if evaluaciones[a.id][0] != "finalizada"
        ]

    def obtener_publica(self, actividad_id: int) -> ActividadPublicaOut:
        actividad = self.obtener(actividad_id)
        motivo = motivo_actividad_no_disponible(actividad)
        if motivo:
            raise NotFound("Actividad no encontrada" if actividad.activo is False else motivo)
        return self._a_publica(actividad, *self._evaluar_varias([actividad])[actividad.id])

    def _validar_area(self, area_id: int) -> None:
        area = self.areas.get(area_id)
        if not area or not area.activo:
            raise DomainError("Selecciona un área activa para la actividad.")

    def crear(self, data: ActividadCreate, admin_id: int) -> Actividad:
        self._validar_area(data.area_id)
        if data.vigencia_fin < _hoy():
            raise DomainError("La fecha de finalización ya pasó: define una vigencia actual o futura.")
        actividad = Actividad(
            area_id=data.area_id,
            nombre=data.nombre, descripcion_corta=data.descripcion_corta,
            descripcion_larga=data.descripcion_larga, imagen_url=data.imagen_url,
            informacion_adicional=data.informacion_adicional,
            campos_formulario=json.dumps([c.model_dump() for c in data.campos_formulario], ensure_ascii=False),
            inscripcion_abierta=data.inscripcion_abierta,
            vigencia_inicio=data.vigencia_inicio, vigencia_fin=data.vigencia_fin,
            limite_participaciones=data.limite_participaciones, periodo_limite=data.periodo_limite,
        )
        self.db.add(actividad)
        self.db.flush()

        # Sesiones iniciales: misma transacción; una inválida cancela todo (nada a medias).
        en_lote: set = set()
        sesiones = [construir_sesion(self.sesiones, actividad, s, en_lote) for s in data.sesiones]
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
        cambios = data.model_dump(exclude_unset=True, exclude={"campos_formulario", "tipo"})
        nulos = sorted(k for k, v in cambios.items() if v is None and k in NO_NULOS)
        if nulos:
            raise DomainError(f"Estos campos no pueden quedar vacíos: {', '.join(nulos)}")
        if "area_id" in cambios and cambios["area_id"] != actividad.area_id:
            self._validar_area(cambios["area_id"])
        inicio = cambios.get("vigencia_inicio", actividad.vigencia_inicio)
        fin = cambios.get("vigencia_fin", actividad.vigencia_fin)
        cambia_vigencia = (inicio, fin) != (actividad.vigencia_inicio, actividad.vigencia_fin)
        if cambia_vigencia:
            if inicio is None or fin is None:
                raise DomainError("Define la fecha de inicio y la de finalización del evento.")
            try:
                validar_rango_vigencia(inicio, fin)
            except ValueError as exc:
                raise DomainError(str(exc)) from exc

        anteriores = auditoria_service.snapshot(actividad, CAMPOS_AUDITORIA)
        for k, v in cambios.items():
            setattr(actividad, k, v)
        if cambia_vigencia and estado_vigencia(inicio, fin, _hoy()) != "finalizado":
            # Vigencia extendida o reprogramada: la tarea programada registrará de nuevo su fin.
            actividad.finalizado_en = None
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
        inscripciones existentes se conservan (el resumen las informa en el panel). Activar
        no la publica si está fuera de su vigencia."""
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

    def eliminar(self, actividad_id: int, admin_id: int) -> dict:
        """Borra la actividad de verdad, con TODO su historial: a diferencia de desactivar
        (que conserva inscripciones e historial), esta acción es irreversible y elimina
        también sus sesiones y sus inscripciones (en cualquier estado). Las notificaciones ya
        enviadas se conservan (ON DELETE SET NULL en notificaciones.inscripcion_id)."""
        actividad = self.obtener(actividad_id)
        sesion_ids = list(self.db.execute(
            select(Sesion.id).where(Sesion.actividad_id == actividad_id)
        ).scalars().all())
        inscripcion_ids = list(self.db.execute(
            select(Inscripcion.id).where(Inscripcion.sesion_id.in_(sesion_ids))
        ).scalars().all()) if sesion_ids else []

        if sesion_ids:
            self.db.execute(delete(Inscripcion).where(Inscripcion.sesion_id.in_(sesion_ids)))
        self.db.execute(delete(Sesion).where(Sesion.actividad_id == actividad_id))

        auditoria_service.registrar(
            self.db, admin_id, "eliminar_evento", "actividad", actividad_id,
            datos_anteriores={
                "nombre": actividad.nombre, "sesiones_eliminadas": len(sesion_ids),
                "inscripciones_eliminadas": len(inscripcion_ids),
            },
        )
        self.db.delete(actividad)
        self.db.commit()
        return {"sesiones_eliminadas": len(sesion_ids), "inscripciones_eliminadas": len(inscripcion_ids)}
