"""Servicio de reservas: valida cédula, aplica la regla global de reserva única,
genera el slot solicitado y crea la reserva bajo control de concurrencia (§7, §10).
"""
from datetime import date, time

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Reserva, EstadoReserva
from app.repositories.agenda_repository import AgendaRepository
from app.repositories.reserva_repository import ReservaRepository
from app.repositories.usuario_repository import UsuarioRepository
from app.schemas.reserva import ReservaCreate
from app.services import auditoria_service
from app.services.errors import Conflict, DomainError, NotFound
from app.services.horario_service import HorarioService
from app.utils.time import add_minutes


class ReservaService:
    def __init__(self, db: Session):
        self.db = db
        self.usuarios = UsuarioRepository(db)
        self.agendas = AgendaRepository(db)
        self.reservas = ReservaRepository(db)
        self.horarios = HorarioService(db)

    def validar_cedula(self, cedula: str) -> tuple[bool, bool]:
        """Devuelve (existe_y_activo, tiene_reserva_activa). No expone datos personales."""
        usuario = self.usuarios.by_cedula(cedula)
        if not usuario or not usuario.activo:
            return False, False
        tiene = len(self.reservas.activas_por_usuario(usuario.id)) > 0
        return True, tiene

    def crear(self, data: ReservaCreate) -> Reserva:
        usuario = self.usuarios.by_cedula(data.cedula)
        if not usuario or not usuario.activo:
            raise NotFound("La cédula no existe en el sistema")

        agenda = self.agendas.get(data.agenda_id)
        if not agenda or not agenda.estado:
            raise DomainError("La agenda no está disponible")

        # Regla global (§7): una sola reserva activa, salvo excepción habilitada por el admin.
        activas = self.reservas.activas_por_usuario(usuario.id)
        if activas and not usuario.puede_reservar_extra:
            raise Conflict("El colaborador ya tiene una reserva activa")

        # El slot solicitado debe existir y estar disponible según la generación dinámica.
        slots = self.horarios.generar(data.agenda_id, data.fecha)
        match = next((s for s in slots if s.hora_inicio == data.hora_inicio), None)
        if match is None:
            raise DomainError("El horario solicitado no es válido para esta agenda")
        if not match.disponible:
            raise Conflict("El horario ya fue reservado")

        hora_fin: time = add_minutes(data.hora_inicio, agenda.duracion_min)
        reserva = Reserva(
            agenda_id=data.agenda_id,
            usuario_id=usuario.id,
            fecha=data.fecha,
            hora_inicio=data.hora_inicio,
            hora_fin=hora_fin,
            estado=EstadoReserva.ACTIVA.value,
        )
        self.db.add(reserva)
        try:
            # El índice único parcial resuelve las confirmaciones concurrentes (§10).
            self.db.flush()
        except IntegrityError:
            self.db.rollback()
            raise Conflict("El horario acaba de ser reservado por otro colaborador")

        # La excepción de reserva adicional se consume al usarse.
        if usuario.puede_reservar_extra and activas:
            usuario.puede_reservar_extra = False

        self.db.commit()
        self.db.refresh(reserva)
        return reserva

    def cancelar(self, reserva_id: int, actor: str) -> Reserva:
        reserva = self.reservas.get(reserva_id)
        if not reserva:
            raise NotFound("Reserva no encontrada")
        reserva.estado = EstadoReserva.CANCELADA.value
        reserva.cancelada_por = actor
        auditoria_service.registrar(self.db, actor, "cancelar", "reserva", reserva.id)
        self.db.commit()  # el horario queda libre automáticamente (índice parcial)
        return reserva

    def reiniciar_semana(self, fecha_lunes: date, actor: str) -> int:
        """Reinicio semanal por borrado lógico (RF-16): conserva la trazabilidad."""
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
            r.cancelada_por = actor
        auditoria_service.registrar(
            self.db, actor, "reiniciar_semana", "reserva", None,
            f"semana {fecha_lunes.isoformat()} ({len(activas)} reservas)"
        )
        self.db.commit()
        return len(activas)

    def habilitar_reserva_extra(self, usuario_id: int, actor: str) -> None:
        """RF-04: habilita manualmente una reserva adicional a un colaborador."""
        usuario = self.usuarios.get(usuario_id)
        if not usuario:
            raise NotFound("Colaborador no encontrado")
        usuario.puede_reservar_extra = True
        auditoria_service.registrar(self.db, actor, "habilitar_reserva", "usuario", usuario_id)
        self.db.commit()
