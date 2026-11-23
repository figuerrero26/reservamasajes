"""Inscripciones: equivalente a ReservaService para el módulo de actividades.

Conserva su propia lógica de negocio (no se mezcla con reservas): aquí no hay turnos, hay
sesiones con CUPO. Control de cupo: el cupo es un número configurable por sesión y MariaDB
no tiene una forma nativa de expresar "máximo N filas que cumplan X" como restricción, así
que se resuelve bloqueando la fila de la sesión (`SELECT ... FOR UPDATE`) antes de contar
las inscripciones activas. Cuando se alcanza el cupo, la sesión queda en estado
`cupo_lleno` y cualquier intento adicional recibe 409 (las inscripciones se cierran solas).
Cancelar una inscripción libera el cupo de inmediato.

Límite de participación por persona (por evento, ver app/utils/vigencia.py): se cuenta sobre
las inscripciones NO canceladas de la persona en la actividad, según la fecha de cada sesión.
Para contar de forma segura ante intentos simultáneos de la misma persona en sesiones
distintas, primero se bloquea la fila del usuario y después la de la sesión (siempre en ese
orden, también en la inscripción manual del administrador).
"""
import json

from sqlalchemy import select
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
from app.services.actividad_service import (
    campos_formulario_de, motivo_actividad_no_disponible, sesion_llena,
)
from app.services.errors import Conflict, DomainError, Forbidden, NotFound
from app.utils.time import now, ya_empezo
from app.utils.vigencia import motivo_limite, para_administrador

MAX_LONGITUD_RESPUESTA = 1000


def _validar_respuestas(campos: list[CampoFormulario], respuestas: dict, estricto: bool = True) -> dict:
    """Valida las respuestas contra la definición de campos de la actividad y descarta
    cualquier clave que no esté definida ahí (nunca se guarda texto libre sin control).
    `estricto=False` (inscripción manual del admin) no exige los campos obligatorios, pero
    sí valida el tipo de lo que se envíe."""
    limpio: dict = {}
    for campo in campos:
        valor = respuestas.get(campo.clave)
        if isinstance(valor, str):
            valor = valor.strip()
        if valor is None or valor == "":
            if campo.requerido and estricto:
                raise DomainError(f"El campo «{campo.etiqueta}» es obligatorio.")
            continue
        if campo.tipo == "numero" and (isinstance(valor, bool) or not isinstance(valor, (int, float))):
            raise DomainError(f"El campo «{campo.etiqueta}» debe ser un número.")
        if campo.tipo == "si_no" and not isinstance(valor, bool):
            raise DomainError(f"El campo «{campo.etiqueta}» debe ser sí/no.")
        if campo.tipo == "seleccion" and campo.opciones and valor not in campo.opciones:
            raise DomainError(f"Valor inválido para «{campo.etiqueta}».")
        if campo.tipo == "texto" and len(str(valor)) > MAX_LONGITUD_RESPUESTA:
            raise DomainError(f"La respuesta a «{campo.etiqueta}» es demasiado larga.")
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
        # Bloqueos en orden fijo: usuario (límite de participación) y luego sesión (cupo).
        usuario = self.db.execute(
            select(Usuario).where(Usuario.id == usuario_id).with_for_update()
        ).scalar_one_or_none()
        if not usuario or not usuario.activo:
            raise NotFound("Usuario no encontrado o inactivo")

        # Bloquea la fila de la sesión: serializa los intentos concurrentes de cupo (ver
        # docstring del módulo) — el admin también pasa por aquí, sin excepción de cupo.
        sesion = self.sesiones.get_for_update(sesion_id)
        if not sesion or not sesion.activa:
            raise DomainError("La sesión no está disponible")
        actividad = sesion.actividad
        # Actividad oculta, de un área desactivada o fuera de su vigencia (próxima o
        # finalizada): tampoco el admin inscribe aquí.
        motivo = motivo_actividad_no_disponible(actividad)
        if motivo:
            raise DomainError(motivo)
        if ya_empezo(sesion.fecha, sesion.hora_inicio):
            raise DomainError("Esta sesión ya no está disponible para inscribirse.")
        # El switch manual de inscripciones solo pausa el portal: el admin sí puede inscribir.
        if not admin_id and not actividad.inscripcion_abierta:
            raise Conflict("Las inscripciones para esta actividad no están abiertas en este momento.")

        if self.inscripciones.activa_por_usuario_sesion(usuario.id, sesion_id):
            raise Conflict(
                "Ya tienes una inscripción activa para esta sesión." if not admin_id
                else "Este colaborador ya tiene una inscripción activa en esta sesión."
            )

        # Límite de participación del evento (excepción por usuario: permite_reservas_multiples).
        if actividad.limite_participaciones is not None and not usuario.permite_reservas_multiples:
            motivo = motivo_limite(
                self.inscripciones.fechas_participacion(usuario.id, actividad.id), sesion.fecha,
                actividad.limite_participaciones, actividad.periodo_limite, actividad.vigencia_inicio,
                "inscripción",
            )
            if motivo:
                raise Conflict(para_administrador(motivo) if admin_id else motivo)

        if sesion_llena(sesion, self.inscripciones.contar_activas_por_sesion(sesion_id)):
            raise Conflict("Esta sesión ya no tiene cupos disponibles.")

        respuestas_validas = _validar_respuestas(campos_formulario_de(actividad), respuestas, estricto=not admin_id)

        inscripcion = Inscripcion(
            sesion_id=sesion_id,
            usuario_id=usuario.id,
            usuario_nombre=usuario.nombre,
            usuario_apellido=usuario.apellido,
            usuario_correo=usuario.correo,
            respuestas_formulario=json.dumps(respuestas_validas, ensure_ascii=False) if respuestas_validas else None,
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
        """Inscripción creada por el administrador en nombre de un colaborador: ignora la
        pausa manual de inscripciones del portal, pero NO la vigencia del evento, el cupo, la
        duplicidad ni el límite de participación."""
        usuario = self.usuarios.by_correo(data.correo)
        if not usuario:
            raise NotFound("No existe ningún colaborador con ese correo")
        return self._crear(usuario.id, data.sesion_id, data.respuestas, data.notes, admin_id)

    def cancelar(self, inscripcion_id: int, admin_id: int, actor_nombre: str,
                 motivo: str | None = None) -> Inscripcion:
        inscripcion = self.inscripciones.get(inscripcion_id)
        if not inscripcion:
            raise NotFound("Inscripción no encontrada")
        if inscripcion.estado != EstadoInscripcion.ACTIVA.value:
            raise DomainError("La inscripción no está activa")
        inscripcion.estado = EstadoInscripcion.CANCELADA.value
        inscripcion.cancelled_at = now()
        inscripcion.cancelled_by = actor_nombre[:80]
        auditoria_service.registrar(
            self.db, admin_id, "cancelar", "inscripcion", inscripcion.id,
            datos_nuevos={"motivo": motivo} if motivo else None,
        )
        self.db.commit()  # el cupo queda libre automáticamente (slot_lock vuelve a NULL)
        return inscripcion

    def cancelar_propia(self, inscripcion_id: int, usuario_id: int) -> Inscripcion:
        """El colaborador puede cancelar su inscripción hasta que la sesión empiece; después
        eso es asistencia/inasistencia y la registra el administrador."""
        inscripcion = self.inscripciones.get(inscripcion_id)
        if not inscripcion:
            raise NotFound("Inscripción no encontrada")
        if inscripcion.usuario_id != usuario_id:
            raise Forbidden("No puedes cancelar una inscripción que no es tuya")
        if inscripcion.estado != EstadoInscripcion.ACTIVA.value:
            raise DomainError("La inscripción no está activa")
        if ya_empezo(inscripcion.sesion.fecha, inscripcion.sesion.hora_inicio):
            raise DomainError("La sesión ya empezó o terminó; no se puede cancelar la inscripción.")
        inscripcion.estado = EstadoInscripcion.CANCELADA.value
        inscripcion.cancelled_at = now()
        inscripcion.cancelled_by = "usuario"
        auditoria_service.registrar(
            self.db, None, "cancelar_propia", "inscripcion", inscripcion.id,
            datos_nuevos={"usuario_id": usuario_id},
        )
        self.db.commit()
        return inscripcion

    def marcar_asistencia(self, inscripcion_id: int, asistio: bool, admin_id: int) -> Inscripcion:
        inscripcion = self.inscripciones.get(inscripcion_id)
        if not inscripcion:
            raise NotFound("Inscripción no encontrada")
        if inscripcion.estado != EstadoInscripcion.ACTIVA.value:
            raise DomainError("La inscripción no está activa")
        sesion = inscripcion.sesion
        if not ya_empezo(sesion.fecha, sesion.hora_inicio):
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
                actividad_id=i.sesion.actividad_id,
                actividad_nombre=i.sesion.actividad.nombre,
                sesion_fecha=i.sesion.fecha.isoformat(),
                sesion_hora_inicio=i.sesion.hora_inicio.strftime("%H:%M"),
                sesion_hora_fin=i.sesion.hora_fin.strftime("%H:%M"),
                sesion_lugar=i.sesion.lugar,
                puede_cancelar=(
                    i.estado == EstadoInscripcion.ACTIVA.value
                    and not ya_empezo(i.sesion.fecha, i.sesion.hora_inicio)
                ),
            )
            for i in self.inscripciones.mias(usuario_id)
        ]

    @staticmethod
    def a_out(i: Inscripcion) -> InscripcionOut:
        try:
            respuestas = json.loads(i.respuestas_formulario) if i.respuestas_formulario else None
        except ValueError:
            respuestas = None
        return InscripcionOut(
            id=i.id, sesion_id=i.sesion_id, usuario_id=i.usuario_id,
            respuestas_formulario=respuestas,
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
        return [
            InscripcionAdminOut(
                **self.a_out(i).model_dump(),
                usuario_nombre=i.usuario_nombre,
                usuario_apellido=i.usuario_apellido,
                usuario_correo=i.usuario_correo,
                actividad_id=i.sesion.actividad_id,
                actividad_nombre=i.sesion.actividad.nombre,
                sesion_fecha=i.sesion.fecha.isoformat(),
                sesion_hora_inicio=i.sesion.hora_inicio.strftime("%H:%M"),
                puede_marcar_asistencia=(
                    i.estado == EstadoInscripcion.ACTIVA.value
                    and ya_empezo(i.sesion.fecha, i.sesion.hora_inicio)
                ),
            )
            for i in inscripciones
        ]
