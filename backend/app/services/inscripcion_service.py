"""Inscripciones: equivalente a ReservaService para el módulo de actividades genéricas.

Control de cupo: a diferencia de Reserva (donde un índice único en BD basta porque el cupo
siempre es 1), aquí el cupo es un número configurable por sesión. MariaDB no tiene una forma
nativa de expresar "máximo N filas que cumplan X" como restricción, así que se resuelve a
nivel de aplicación bloqueando la fila de la sesión (`SELECT ... FOR UPDATE`) antes de contar
las inscripciones activas — el mismo patrón de bloqueo que ya usa ReservaService con el
usuario, aplicado aquí a la sesión porque es la sesión (no el usuario) la que tiene el
recurso limitado.
"""
import json
from datetime import datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import EstadoInscripcion, Inscripcion, Usuario
from app.repositories.inscripcion_repository import InscripcionRepository
from app.repositories.sesion_repository import SesionRepository
from app.repositories.usuario_repository import UsuarioRepository
from app.schemas.actividad import CampoFormulario
from app.schemas.inscripcion import (
    InscripcionAdminOut, InscripcionCreateManual, InscripcionOut, MiInscripcionOut,
)
from app.services import auditoria_service
from app.services.actividad_service import campos_formulario_de, inscripcion_disponible
from app.services.errors import Conflict, DomainError, Forbidden, NotFound
from app.utils.time import TZ, now


def _validar_respuestas(campos: list[CampoFormulario], respuestas: dict) -> dict:
    """Valida las respuestas contra la definición de campos de la actividad y descarta
    cualquier clave que no esté definida ahí (nunca se guarda texto libre sin control)."""
    limpio: dict = {}
    for campo in campos:
        valor = respuestas.get(campo.clave)
        if campo.requerido and (valor is None or valor == ""):
            raise DomainError(f"El campo «{campo.etiqueta}» es obligatorio.")
        if valor is None:
            continue
        if campo.tipo == "numero" and not isinstance(valor, (int, float)):
            raise DomainError(f"El campo «{campo.etiqueta}» debe ser un número.")
        if campo.tipo == "si_no" and not isinstance(valor, bool):
            raise DomainError(f"El campo «{campo.etiqueta}» debe ser sí/no.")
        if campo.tipo == "seleccion" and campo.opciones and valor not in campo.opciones:
            raise DomainError(f"Valor inválido para «{campo.etiqueta}».")
        limpio[campo.clave] = valor
    return limpio


class InscripcionService:
    def __init__(self, db: Session):
        self.db = db
        self.usuarios = UsuarioRepository(db)
        self.sesiones = SesionRepository(db)
        self.inscripciones = InscripcionRepository(db)

    def _crear(self, usuario_id: int, sesion_id: int, respuestas: dict,
               notes: str | None, admin_id: int | None) -> Inscripcion:
        usuario = self.db.get(Usuario, usuario_id)
        if not usuario or not usuario.activo:
            raise NotFound("Usuario no encontrado o inactivo")

        # Bloquea la fila de la sesión: serializa los intentos concurrentes de cupo (ver
        # docstring del módulo) — el admin también pasa por aquí, sin excepción de cupo.
        sesion = self.sesiones.get_for_update(sesion_id)
        if not sesion or not sesion.activa:
            raise DomainError("La sesión no está disponible")
        if datetime.combine(sesion.fecha, sesion.hora_inicio, tzinfo=TZ) <= now():
            raise DomainError("Esta sesión ya no está disponible para inscribirse.")

        actividad = sesion.actividad
        if not admin_id and not inscripcion_disponible(actividad):
            raise Conflict("Las inscripciones para esta actividad no están abiertas en este momento.")

        if self.inscripciones.activa_por_usuario_sesion(usuario.id, sesion_id):
            raise Conflict("Ya tienes una inscripción activa para esta sesión.")

        if sesion.cupo_maximo is not None:
            ocupados = self.inscripciones.contar_activas_por_sesion(sesion_id)
            if ocupados >= sesion.cupo_maximo:
                raise Conflict("Esta sesión ya no tiene cupos disponibles.")

        campos = campos_formulario_de(actividad)
        respuestas_validas = _validar_respuestas(campos, respuestas)

        inscripcion = Inscripcion(
            sesion_id=sesion_id,
            usuario_id=usuario.id,
            usuario_nombre=usuario.nombre,
            usuario_apellido=usuario.apellido,
            usuario_correo=usuario.correo,
            respuestas_formulario=json.dumps(respuestas_validas) if respuestas_validas else None,
            estado=EstadoInscripcion.ACTIVA.value,
            notes=notes,
        )
        self.db.add(inscripcion)
        try:
            self.db.flush()
        except IntegrityError:
            self.db.rollback()
            raise Conflict("Ya tienes una inscripción activa para esta sesión.")

        accion = "crear_inscripcion_admin" if admin_id else "crear_inscripcion"
        auditoria_service.registrar(
            self.db, admin_id, accion, "inscripcion", inscripcion.id,
            datos_nuevos={"usuario_id": usuario.id, "sesion_id": sesion_id},
        )
        self.db.commit()
        self.db.refresh(inscripcion)
        return inscripcion

    def crear(self, sesion_id: int, respuestas: dict, usuario_id: int) -> Inscripcion:
        """Inscripción creada por el propio usuario autenticado (portal público)."""
        return self._crear(usuario_id, sesion_id, respuestas, None, None)

    def crear_manual(self, data: InscripcionCreateManual, admin_id: int) -> Inscripcion:
        """Inscripción creada directamente por el administrador en nombre de un colaborador
        — igual que ReservaService.crear_manual, no exenta del cupo."""
        usuario = self.usuarios.by_correo(data.correo)
        if not usuario:
            raise NotFound("No existe ningún colaborador con ese correo")
        return self._crear(usuario.id, data.sesion_id, data.respuestas, data.notes, admin_id)

    def cancelar(self, inscripcion_id: int, admin_id: int, actor_nombre: str) -> Inscripcion:
        inscripcion = self.inscripciones.get(inscripcion_id)
        if not inscripcion:
            raise NotFound("Inscripción no encontrada")
        if inscripcion.estado != EstadoInscripcion.ACTIVA.value:
            raise DomainError("La inscripción no está activa")
        inscripcion.estado = EstadoInscripcion.CANCELADA.value
        inscripcion.cancelled_at = now()
        inscripcion.cancelled_by = actor_nombre
        auditoria_service.registrar(self.db, admin_id, "cancelar", "inscripcion", inscripcion.id)
        self.db.commit()  # el cupo queda libre automáticamente (slot_lock vuelve a NULL)
        return inscripcion

    def cancelar_propia(self, inscripcion_id: int, usuario_id: int) -> Inscripcion:
        inscripcion = self.inscripciones.get(inscripcion_id)
        if not inscripcion:
            raise NotFound("Inscripción no encontrada")
        if inscripcion.usuario_id != usuario_id:
            raise Forbidden("No puedes cancelar una inscripción que no es tuya")
        if inscripcion.estado != EstadoInscripcion.ACTIVA.value:
            raise DomainError("La inscripción no está activa")
        inscripcion.estado = EstadoInscripcion.CANCELADA.value
        inscripcion.cancelled_at = now()
        inscripcion.cancelled_by = "usuario"
        auditoria_service.registrar(self.db, None, "cancelar_propia", "inscripcion", inscripcion.id)
        self.db.commit()
        return inscripcion

    def marcar_asistencia(self, inscripcion_id: int, asistio: bool, admin_id: int) -> Inscripcion:
        inscripcion = self.inscripciones.get(inscripcion_id)
        if not inscripcion:
            raise NotFound("Inscripción no encontrada")
        if inscripcion.estado != EstadoInscripcion.ACTIVA.value:
            raise DomainError("La inscripción no está activa")
        sesion = inscripcion.sesion
        if datetime.combine(sesion.fecha, sesion.hora_inicio, tzinfo=TZ) > now():
            raise DomainError("No se puede marcar asistencia de una sesión que aún no ha ocurrido")
        inscripcion.estado = EstadoInscripcion.COMPLETADA.value if asistio else EstadoInscripcion.NO_ASISTIO.value
        auditoria_service.registrar(
            self.db, admin_id, "marcar_asistencia", "inscripcion", inscripcion.id,
            datos_nuevos={"estado": inscripcion.estado},
        )
        self.db.commit()
        return inscripcion

    def mias(self, usuario_id: int) -> list[MiInscripcionOut]:
        return [
            MiInscripcionOut(
                **self.a_out(i).model_dump(),
                actividad_nombre=i.sesion.actividad.nombre,
                sesion_fecha=i.sesion.fecha.isoformat(),
                sesion_hora_inicio=i.sesion.hora_inicio.strftime("%H:%M"),
                sesion_hora_fin=i.sesion.hora_fin.strftime("%H:%M"),
            )
            for i in self.inscripciones.mias(usuario_id)
        ]

    def a_out(self, i: Inscripcion) -> InscripcionOut:
        return InscripcionOut(
            id=i.id, sesion_id=i.sesion_id, usuario_id=i.usuario_id,
            respuestas_formulario=json.loads(i.respuestas_formulario) if i.respuestas_formulario else None,
            estado=i.estado, notes=i.notes, created_at=i.created_at,
            cancelled_at=i.cancelled_at, cancelled_by=i.cancelled_by,
        )

    def buscar(
        self, nombre: str | None = None, correo: str | None = None,
        actividad_id: int | None = None, sesion_id: int | None = None, estado: str | None = None,
    ) -> list[InscripcionAdminOut]:
        inscripciones = self.inscripciones.buscar(
            nombre=nombre, correo=correo, actividad_id=actividad_id, sesion_id=sesion_id, estado=estado,
        )
        ahora = now()
        return [
            InscripcionAdminOut(
                **self.a_out(i).model_dump(),
                usuario_nombre=i.usuario_nombre,
                usuario_apellido=i.usuario_apellido,
                usuario_correo=i.usuario_correo,
                actividad_nombre=i.sesion.actividad.nombre,
                sesion_fecha=i.sesion.fecha.isoformat(),
                sesion_hora_inicio=i.sesion.hora_inicio.strftime("%H:%M"),
                puede_marcar_asistencia=(
                    i.estado == EstadoInscripcion.ACTIVA.value
                    and datetime.combine(i.sesion.fecha, i.sesion.hora_inicio, tzinfo=TZ) <= ahora
                ),
            )
            for i in inscripciones
        ]
