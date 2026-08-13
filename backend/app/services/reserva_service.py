"""Servicio de reservas: aplica la regla de una reserva por usuario+evento+día, genera el
slot solicitado y crea la reserva bajo control de concurrencia.
"""
from datetime import date, datetime, time

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Reserva, EstadoReserva, Usuario
from app.repositories.agenda_repository import AgendaRepository
from app.repositories.configuracion_repository import ConfiguracionRepository
from app.repositories.reserva_repository import ReservaRepository
from app.repositories.usuario_repository import UsuarioRepository
from app.schemas.reserva import EstadoSlot, ReservaCreateManual
from app.services import auditoria_service
from app.services.errors import Conflict, DomainError, Forbidden, NotFound
from app.services.horario_service import HorarioService
from app.utils.time import TZ, add_minutes, now


class ReservaService:
    def __init__(self, db: Session):
        self.db = db
        self.usuarios = UsuarioRepository(db)
        self.agendas = AgendaRepository(db)
        self.reservas = ReservaRepository(db)
        self.configuracion = ConfiguracionRepository(db)
        self.horarios = HorarioService(db)

    def _crear(self, usuario_id: int, agenda_id: int, fecha: date, hora_inicio: time,
               notes: str | None, admin_id: int | None) -> Reserva:
        # Bloquea la fila del usuario durante la transacción: serializa los intentos
        # concurrentes de la MISMA persona (MariaDB no admite un índice condicionado a un
        # flag de otra fila, así que el chequeo de la regla se hace también a nivel de
        # aplicación; el anti-duplicado real, en cambio, lo garantizan los dos índices
        # únicos de la tabla `reservas` — ver app/models/reserva.py).
        usuario = self.db.execute(
            select(Usuario).where(Usuario.id == usuario_id).with_for_update()
        ).scalar_one_or_none()
        if not usuario or not usuario.activo:
            raise NotFound("Usuario no encontrado o inactivo")

        agenda = self.agendas.get(agenda_id)
        if not agenda or not agenda.activo:
            raise DomainError("La agenda no está disponible")

        # Regla: máximo una reserva activa por usuario+evento+día, sin importar la hora.
        existente = self.reservas.activa_por_usuario_evento_fecha(usuario.id, agenda.servicio_id, fecha)
        if existente and not usuario.permite_reservas_multiples:
            raise Conflict("Ya tienes una reserva para este evento en esta fecha.")

        # El slot solicitado debe existir y estar disponible según la generación dinámica.
        slots = self.horarios.generar(agenda_id, fecha)
        match = next((s for s in slots if s.hora_inicio == hora_inicio), None)
        if match is None:
            raise DomainError("El horario solicitado no es válido para esta agenda")
        if match.estado != EstadoSlot.DISPONIBLE:
            raise Conflict("El horario ya no está disponible")

        hora_fin: time = add_minutes(hora_inicio, agenda.duracion_minutos)
        reserva = Reserva(
            agenda_id=agenda_id,
            servicio_id=agenda.servicio_id,
            usuario_id=usuario.id,
            fecha=fecha,
            hora_inicio=hora_inicio,
            hora_fin=hora_fin,
            estado=EstadoReserva.ACTIVA.value,
            notes=notes,
        )
        self.db.add(reserva)
        try:
            # Última barrera: los índices únicos de la tabla resuelven las confirmaciones
            # simultáneas aunque dos procesos hayan pasado las validaciones anteriores a la vez.
            self.db.flush()
        except IntegrityError as exc:
            self.db.rollback()
            if "uq_reserva_activa_evento_dia" in str(getattr(exc, "orig", exc)):
                raise Conflict("Ya tienes una reserva para este evento en esta fecha.")
            raise Conflict("El horario seleccionado acaba de ser reservado. Por favor seleccione otro horario")

        accion = "crear_reserva_admin" if admin_id else "crear_reserva"
        auditoria_service.registrar(
            self.db, admin_id, accion, "reserva", reserva.id,
            datos_nuevos={"usuario_id": usuario.id, "agenda_id": agenda_id,
                         "fecha": fecha.isoformat(), "hora_inicio": hora_inicio.isoformat()},
        )
        self.db.commit()
        self.db.refresh(reserva)
        return reserva

    def crear(self, agenda_id: int, fecha: date, hora_inicio: time, usuario_id: int) -> Reserva:
        """Reserva creada por el propio usuario autenticado (portal público)."""
        return self._crear(usuario_id, agenda_id, fecha, hora_inicio, None, None)

    def crear_manual(self, data: ReservaCreateManual, admin_id: int) -> Reserva:
        """Reserva creada directamente por el administrador en nombre de un colaborador."""
        usuario = self.usuarios.by_correo(data.correo)
        if not usuario:
            raise NotFound("No existe ningún colaborador con ese correo")
        return self._crear(usuario.id, data.agenda_id, data.fecha, data.hora_inicio, data.notes, admin_id)

    def cancelar(self, reserva_id: int, admin_id: int | None, actor_nombre: str) -> Reserva:
        """Cancelación administrativa (sin restricción de anticipación)."""
        reserva = self.reservas.get(reserva_id)
        if not reserva:
            raise NotFound("Reserva no encontrada")
        if reserva.estado != EstadoReserva.ACTIVA.value:
            raise DomainError("La reserva no está activa")
        reserva.estado = EstadoReserva.CANCELADA.value
        reserva.cancelled_at = now()
        reserva.cancelled_by = actor_nombre
        auditoria_service.registrar(self.db, admin_id, "cancelar", "reserva", reserva.id)
        self.db.commit()  # el horario queda libre automáticamente (slot_lock vuelve a NULL)
        return reserva

    def cancelar_propia(self, reserva_id: int, usuario_id: int) -> Reserva:
        """Cancelación por el propio dueño de la reserva, sujeta a la política configurada."""
        reserva = self.reservas.get(reserva_id)
        if not reserva:
            raise NotFound("Reserva no encontrada")
        if reserva.usuario_id != usuario_id:
            raise Forbidden("No puedes cancelar una reserva que no es tuya")
        if reserva.estado != EstadoReserva.ACTIVA.value:
            raise DomainError("La reserva no está activa")

        horas_minimas = int(
            self.configuracion.get("cancelacion_horas_minimas")
            or 0
        )
        if horas_minimas > 0:
            inicio_cita = datetime.combine(reserva.fecha, reserva.hora_inicio, tzinfo=TZ)
            horas_restantes = (inicio_cita - now()).total_seconds() / 3600
            if horas_restantes < horas_minimas:
                raise DomainError(
                    f"No se puede cancelar con menos de {horas_minimas} hora(s) de anticipación."
                )

        reserva.estado = EstadoReserva.CANCELADA.value
        reserva.cancelled_at = now()
        reserva.cancelled_by = "usuario"
        auditoria_service.registrar(self.db, None, "cancelar_propia", "reserva", reserva.id)
        self.db.commit()
        return reserva

    def mias(self, usuario_id: int) -> list[Reserva]:
        return self.reservas.mias(usuario_id)

    def buscar(self, nombre: str | None = None, correo: str | None = None,
               fecha: date | None = None, agenda_id: int | None = None) -> list[Reserva]:
        return self.reservas.buscar(nombre=nombre, correo=correo, fecha=fecha, agenda_id=agenda_id)

    def reiniciar_semana(self, fecha_lunes: date, admin_id: int) -> int:
        """Reinicio semanal por cambio de estado: conserva la trazabilidad, nunca borra filas."""
        from datetime import timedelta
        fin = fecha_lunes + timedelta(days=6)
        activas = (
            self.db.query(Reserva)
            .filter(
                Reserva.fecha >= fecha_lunes,
                Reserva.fecha <= fin,
                Reserva.estado == EstadoReserva.ACTIVA.value,
            )
            .all()
        )
        for r in activas:
            r.estado = EstadoReserva.CANCELADA.value
            r.cancelled_at = now()
            r.cancelled_by = "reinicio_semana"
        auditoria_service.registrar(
            self.db, admin_id, "reiniciar_semana", "reserva", None,
            datos_nuevos={"semana": fecha_lunes.isoformat(), "reservas_afectadas": len(activas)},
        )
        self.db.commit()
        return len(activas)

    def habilitar_reserva_extra(self, usuario_id: int, admin_id: int, permitir: bool = True) -> None:
        """Habilita o revoca la excepción a la regla de una reserva por evento por día."""
        usuario = self.usuarios.get(usuario_id)
        if not usuario:
            raise NotFound("Colaborador no encontrado")
        usuario.permite_reservas_multiples = permitir
        auditoria_service.registrar(
            self.db, admin_id, "habilitar_reserva_multiple" if permitir else "revocar_reserva_multiple",
            "usuario", usuario_id,
        )
        self.db.commit()
