"""Sesiones: ocurrencias concretas (fecha + horario + cupo) de una Actividad."""
from datetime import timedelta

from sqlalchemy.orm import Session

from app.models import Sesion
from app.repositories.actividad_repository import ActividadRepository
from app.repositories.inscripcion_repository import InscripcionRepository
from app.repositories.sesion_repository import SesionRepository
from app.schemas.sesion import GenerarSesionesIn, SesionCreate, SesionOut, SesionUpdate
from app.services import auditoria_service
from app.services.errors import NotFound

CAMPOS_AUDITORIA = ["id", "actividad_id", "fecha", "hora_inicio", "hora_fin", "cupo_maximo", "activa"]


class SesionService:
    def __init__(self, db: Session):
        self.db = db
        self.actividades = ActividadRepository(db)
        self.repo = SesionRepository(db)
        self.inscripciones = InscripcionRepository(db)

    def _a_out(self, sesion: Sesion) -> SesionOut:
        inscritos = self.inscripciones.contar_activas_por_sesion(sesion.id)
        cupos_disponibles = (sesion.cupo_maximo - inscritos) if sesion.cupo_maximo is not None else None
        return SesionOut(
            id=sesion.id, actividad_id=sesion.actividad_id, fecha=sesion.fecha,
            hora_inicio=sesion.hora_inicio, hora_fin=sesion.hora_fin, cupo_maximo=sesion.cupo_maximo,
            activa=sesion.activa, inscritos=inscritos, cupos_disponibles=cupos_disponibles,
        )

    def listar(self, actividad_id: int, *, solo_activas: bool = False, solo_futuras: bool = False) -> list[SesionOut]:
        return [
            self._a_out(s)
            for s in self.repo.por_actividad(actividad_id, solo_activas=solo_activas, solo_futuras=solo_futuras)
        ]

    def obtener(self, sesion_id: int) -> Sesion:
        sesion = self.repo.get(sesion_id)
        if not sesion:
            raise NotFound("Sesión no encontrada")
        return sesion

    def obtener_out(self, sesion_id: int) -> SesionOut:
        return self._a_out(self.obtener(sesion_id))

    def crear(self, actividad_id: int, data: SesionCreate, admin_id: int) -> SesionOut:
        if not self.actividades.get(actividad_id):
            raise NotFound("Actividad no encontrada")
        sesion = Sesion(
            actividad_id=actividad_id, fecha=data.fecha, hora_inicio=data.hora_inicio,
            hora_fin=data.hora_fin, cupo_maximo=data.cupo_maximo,
        )
        self.db.add(sesion)
        self.db.flush()
        auditoria_service.registrar(
            self.db, admin_id, "crear", "sesion", sesion.id,
            datos_nuevos=auditoria_service.snapshot(sesion, CAMPOS_AUDITORIA),
        )
        self.db.commit()
        return self._a_out(sesion)

    def generar_lote(self, actividad_id: int, data: GenerarSesionesIn, admin_id: int) -> list[SesionOut]:
        """Atajo para actividades que sí se repiten: crea una sesión por cada día del rango
        que caiga en `dias_semana` (0=lunes...6=domingo)."""
        if not self.actividades.get(actividad_id):
            raise NotFound("Actividad no encontrada")
        fechas = []
        cursor = data.fecha_inicio
        while cursor <= data.fecha_fin:
            if cursor.weekday() in data.dias_semana:
                fechas.append(cursor)
            cursor += timedelta(days=1)
        sesiones = self.repo.crear_lote(
            actividad_id, fechas, data.hora_inicio, data.hora_fin, data.cupo_maximo,
        )
        auditoria_service.registrar(
            self.db, admin_id, "generar_sesiones", "actividad", actividad_id,
            datos_nuevos={"cantidad": len(sesiones), "fecha_inicio": data.fecha_inicio.isoformat(),
                         "fecha_fin": data.fecha_fin.isoformat()},
        )
        self.db.commit()
        return [self._a_out(s) for s in sesiones]

    def actualizar(self, sesion_id: int, data: SesionUpdate, admin_id: int) -> SesionOut:
        sesion = self.obtener(sesion_id)
        anteriores = auditoria_service.snapshot(sesion, CAMPOS_AUDITORIA)
        for k, v in data.model_dump(exclude_unset=True).items():
            setattr(sesion, k, v)
        auditoria_service.registrar(
            self.db, admin_id, "editar", "sesion", sesion.id,
            datos_anteriores=anteriores, datos_nuevos=auditoria_service.snapshot(sesion, CAMPOS_AUDITORIA),
        )
        self.db.commit()
        return self._a_out(sesion)

    def desactivar(self, sesion_id: int, admin_id: int) -> SesionOut:
        sesion = self.obtener(sesion_id)
        anteriores = auditoria_service.snapshot(sesion, CAMPOS_AUDITORIA)
        sesion.activa = False
        auditoria_service.registrar(
            self.db, admin_id, "desactivar", "sesion", sesion_id,
            datos_anteriores=anteriores, datos_nuevos=auditoria_service.snapshot(sesion, CAMPOS_AUDITORIA),
        )
        self.db.commit()
        return self._a_out(sesion)
