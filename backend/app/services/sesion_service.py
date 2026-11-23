"""Sesiones: ocurrencias concretas (fecha + horario + cupo) de una Actividad."""
from datetime import timedelta

from sqlalchemy.orm import Session

from app.models import Sesion
from app.repositories.actividad_repository import ActividadRepository
from app.repositories.inscripcion_repository import InscripcionRepository
from app.repositories.sesion_repository import SesionRepository
from app.schemas.sesion import MAX_SESIONES_LOTE, GenerarSesionesIn, SesionCreate, SesionOut, SesionUpdate
from app.services import auditoria_service
from app.services.actividad_service import (
    actividad_disponible, construir_sesion, estado_sesion, ventana_inscripcion,
)
from app.services.errors import DomainError, NotFound
from app.utils.time import ya_empezo

CAMPOS_AUDITORIA = ["id", "actividad_id", "fecha", "hora_inicio", "hora_fin", "cupo_maximo", "lugar", "activa"]
NO_NULOS = {"fecha", "hora_inicio", "hora_fin", "activa"}


class SesionService:
    def __init__(self, db: Session):
        self.db = db
        self.actividades = ActividadRepository(db)
        self.repo = SesionRepository(db)
        self.inscripciones = InscripcionRepository(db)

    def _a_out_varias(self, sesiones: list[Sesion], usuario_id: int | None = None) -> list[SesionOut]:
        ids = [s.id for s in sesiones]
        conteos = self.inscripciones.contar_activas_por_sesiones(ids)
        inscritas = self.inscripciones.sesiones_inscritas(usuario_id, ids) if usuario_id else set()
        ventanas: dict[int, str] = {}
        resultado = []
        for s in sesiones:
            if s.actividad_id not in ventanas:
                ventanas[s.actividad_id] = ventana_inscripcion(s.actividad)
            inscritos = conteos.get(s.id, 0)
            resultado.append(SesionOut(
                id=s.id, actividad_id=s.actividad_id, fecha=s.fecha,
                hora_inicio=s.hora_inicio, hora_fin=s.hora_fin, cupo_maximo=s.cupo_maximo, lugar=s.lugar,
                activa=s.activa, inscritos=inscritos,
                cupos_disponibles=max(0, s.cupo_maximo - inscritos) if s.cupo_maximo is not None else None,
                estado=estado_sesion(s, inscritos, ventanas[s.actividad_id]),
                inscrito=(s.id in inscritas) if usuario_id else None,
            ))
        return resultado

    def _a_out(self, sesion: Sesion) -> SesionOut:
        return self._a_out_varias([sesion])[0]

    def listar(self, actividad_id: int, *, solo_activas: bool = False, solo_futuras: bool = False,
               usuario_id: int | None = None) -> list[SesionOut]:
        return self._a_out_varias(
            self.repo.por_actividad(actividad_id, solo_activas=solo_activas, solo_futuras=solo_futuras),
            usuario_id=usuario_id,
        )

    def listar_publicas(self, actividad_id: int, usuario_id: int | None = None) -> list[SesionOut]:
        actividad = self.actividades.get(actividad_id)
        if not actividad or not actividad_disponible(actividad):
            raise NotFound("Actividad no encontrada")
        return self.listar(actividad_id, solo_activas=True, solo_futuras=True, usuario_id=usuario_id)

    def obtener(self, sesion_id: int) -> Sesion:
        sesion = self.repo.get(sesion_id)
        if not sesion:
            raise NotFound("Sesión no encontrada")
        return sesion

    def _validar_actividad(self, actividad_id: int) -> None:
        if not self.actividades.get(actividad_id):
            raise NotFound("Actividad no encontrada")

    def crear(self, actividad_id: int, data: SesionCreate, admin_id: int) -> SesionOut:
        self._validar_actividad(actividad_id)
        sesion = construir_sesion(self.repo, actividad_id, data)
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
        que caiga en `dias_semana` (0=lunes...6=domingo). Omite fechas ya pasadas y las que
        ya tienen una sesión a esa misma hora (no duplica)."""
        self._validar_actividad(actividad_id)
        nuevas: list[Sesion] = []
        cursor = data.fecha_inicio
        while cursor <= data.fecha_fin:
            if (cursor.weekday() in data.dias_semana and not ya_empezo(cursor, data.hora_inicio)
                    and not self.repo.existe(actividad_id, cursor, data.hora_inicio)):
                nuevas.append(Sesion(
                    actividad_id=actividad_id, fecha=cursor, hora_inicio=data.hora_inicio,
                    hora_fin=data.hora_fin, cupo_maximo=data.cupo_maximo, lugar=data.lugar,
                ))
            cursor += timedelta(days=1)
        if not nuevas:
            raise DomainError("El rango no produce ninguna sesión nueva (fechas pasadas, días no seleccionados o ya existentes).")
        if len(nuevas) > MAX_SESIONES_LOTE:
            raise DomainError(f"El rango produciría {len(nuevas)} sesiones; el máximo por lote es {MAX_SESIONES_LOTE}.")
        sesiones = self.repo.crear_lote(nuevas)
        auditoria_service.registrar(
            self.db, admin_id, "generar_sesiones", "actividad", actividad_id,
            datos_nuevos={"cantidad": len(sesiones), "fecha_inicio": data.fecha_inicio.isoformat(),
                         "fecha_fin": data.fecha_fin.isoformat()},
        )
        self.db.commit()
        return self._a_out_varias(sesiones)

    def actualizar(self, sesion_id: int, data: SesionUpdate, admin_id: int) -> SesionOut:
        sesion = self.obtener(sesion_id)
        cambios = data.model_dump(exclude_unset=True)
        nulos = sorted(k for k, v in cambios.items() if v is None and k in NO_NULOS)
        if nulos:
            raise DomainError(f"Estos campos no pueden quedar vacíos: {', '.join(nulos)}")

        fecha = cambios.get("fecha", sesion.fecha)
        hora_inicio = cambios.get("hora_inicio", sesion.hora_inicio)
        hora_fin = cambios.get("hora_fin", sesion.hora_fin)
        if hora_fin <= hora_inicio:
            raise DomainError("La hora de fin debe ser posterior a la hora de inicio")
        inscritos = self.inscripciones.contar_activas_por_sesion(sesion.id)
        if ("fecha" in cambios or "hora_inicio" in cambios) and (fecha, hora_inicio) != (sesion.fecha, sesion.hora_inicio):
            if ya_empezo(fecha, hora_inicio):
                raise DomainError("No se puede mover la sesión a una fecha u hora que ya pasó.")
        nuevo_cupo = cambios.get("cupo_maximo", sesion.cupo_maximo)
        if nuevo_cupo is not None and nuevo_cupo < inscritos:
            raise DomainError(
                f"La sesión ya tiene {inscritos} inscrito(s): el cupo no puede ser menor. "
                "Cancele inscripciones primero si necesita reducirlo."
            )

        anteriores = auditoria_service.snapshot(sesion, CAMPOS_AUDITORIA)
        for k, v in cambios.items():
            setattr(sesion, k, v)
        auditoria_service.registrar(
            self.db, admin_id, "editar", "sesion", sesion.id,
            datos_anteriores=anteriores, datos_nuevos=auditoria_service.snapshot(sesion, CAMPOS_AUDITORIA),
        )
        self.db.commit()
        return self._a_out(sesion)

    def desactivar(self, sesion_id: int, admin_id: int) -> SesionOut:
        """Desactivar cierra la sesión a nuevas inscripciones; las existentes se conservan."""
        sesion = self.obtener(sesion_id)
        anteriores = auditoria_service.snapshot(sesion, CAMPOS_AUDITORIA)
        sesion.activa = False
        auditoria_service.registrar(
            self.db, admin_id, "desactivar", "sesion", sesion_id,
            datos_anteriores=anteriores, datos_nuevos=auditoria_service.snapshot(sesion, CAMPOS_AUDITORIA),
        )
        self.db.commit()
        return self._a_out(sesion)
