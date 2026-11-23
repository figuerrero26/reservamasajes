from datetime import date, time

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session, joinedload

from app.models import Agenda, Reserva, EstadoReserva
from app.repositories.base import BaseRepository
from app.utils.time import now


def _con_detalle(stmt):
    """Carga adelantada de evento y agenda+área: los listados administrativos muestran
    nombres legibles sin disparar una consulta por fila."""
    return stmt.options(
        joinedload(Reserva.servicio),
        joinedload(Reserva.agenda).joinedload(Agenda.area),
    )


def _solo_futuras(stmt):
    """Reservas cuyo horario todavía no ha empezado (en la zona horaria de la aplicación)."""
    ahora = now()
    return stmt.where(
        or_(
            Reserva.fecha > ahora.date(),
            and_(Reserva.fecha == ahora.date(), Reserva.hora_inicio > ahora.time()),
        )
    )


class ReservaRepository(BaseRepository[Reserva]):
    def __init__(self, db: Session):
        super().__init__(Reserva, db)

    def activas_por_usuario(self, usuario_id: int) -> list[Reserva]:
        return list(
            self.db.execute(
                select(Reserva).where(
                    Reserva.usuario_id == usuario_id,
                    Reserva.estado == EstadoReserva.ACTIVA.value,
                )
            ).scalars().all()
        )

    def activa_por_usuario_evento_fecha(self, usuario_id: int, servicio_id: int, fecha: date) -> Reserva | None:
        """Solo para el mensaje de error amigable antes de tocar la BD (ver ReservaService).
        Usa `.first()` a propósito: con la excepción `permite_reservas_multiples` puede haber
        más de una fila activa para la misma combinación usuario+evento+día."""
        return self.db.execute(
            select(Reserva).where(
                Reserva.usuario_id == usuario_id,
                Reserva.servicio_id == servicio_id,
                Reserva.fecha == fecha,
                Reserva.estado == EstadoReserva.ACTIVA.value,
            )
        ).scalars().first()

    def activa_por_usuario_evento_rango(
        self, usuario_id: int, servicio_id: int, fecha_inicio: date, fecha_fin: date,
    ) -> Reserva | None:
        """Como `activa_por_usuario_evento_fecha`, pero para la regla opcional
        `evento_unico_por_semana`: busca en todo el rango [fecha_inicio, fecha_fin]."""
        return self.db.execute(
            select(Reserva).where(
                Reserva.usuario_id == usuario_id,
                Reserva.servicio_id == servicio_id,
                Reserva.fecha >= fecha_inicio,
                Reserva.fecha <= fecha_fin,
                Reserva.estado == EstadoReserva.ACTIVA.value,
            )
        ).scalars().first()

    def activas_por_agenda_fecha(self, agenda_id: int, fecha: date) -> list[Reserva]:
        return list(
            self.db.execute(
                select(Reserva).where(
                    Reserva.agenda_id == agenda_id,
                    Reserva.fecha == fecha,
                    Reserva.estado == EstadoReserva.ACTIVA.value,
                )
            ).scalars().all()
        )

    def activas_por_agendas_fechas(self, agenda_ids: list[int], fechas: list[date]) -> list[Reserva]:
        """Reservas activas de varias agendas y días en una sola consulta (resumen del
        catálogo, ver HorarioService.resumen_disponibilidad)."""
        if not agenda_ids or not fechas:
            return []
        return list(self.db.execute(
            select(Reserva).where(
                Reserva.agenda_id.in_(agenda_ids),
                Reserva.fecha.in_(fechas),
                Reserva.estado == EstadoReserva.ACTIVA.value,
            )
        ).scalars().all())

    def no_canceladas_por_fecha(self, fecha: date) -> list[Reserva]:
        """Reservas activas o ya cerradas (completada/no_asistio) de un día, de TODAS las
        agendas en una sola consulta — para la vista "por día" del panel. Las canceladas se
        excluyen: su turno vuelve a quedar libre."""
        return list(
            self.db.execute(
                select(Reserva).where(
                    Reserva.fecha == fecha,
                    Reserva.estado != EstadoReserva.CANCELADA.value,
                ).order_by(Reserva.hora_inicio)
            ).scalars().all()
        )

    def activas_futuras(
        self, *, agenda_id: int | None = None, servicio_id: int | None = None,
        area_id: int | None = None, fecha: date | None = None,
        hora_inicio: time | None = None, hora_fin: time | None = None,
    ) -> list[Reserva]:
        """Reservas activas que todavía no han ocurrido, filtradas por el alcance de un
        cambio administrativo: agenda/evento/área que se modifica o desactiva, o la fecha (y
        rango horario opcional) de un bloqueo o festivo. Se usa para avisar al administrador
        qué reservas quedan afectadas — nunca para cancelarlas automáticamente."""
        stmt = _con_detalle(select(Reserva)).where(Reserva.estado == EstadoReserva.ACTIVA.value)
        stmt = _solo_futuras(stmt)
        if agenda_id is not None:
            stmt = stmt.where(Reserva.agenda_id == agenda_id)
        if servicio_id is not None:
            stmt = stmt.where(Reserva.servicio_id == servicio_id)
        if area_id is not None:
            stmt = stmt.join(Agenda, Reserva.agenda_id == Agenda.id).where(Agenda.area_id == area_id)
        if fecha is not None:
            stmt = stmt.where(Reserva.fecha == fecha)
        if hora_inicio is not None and hora_fin is not None:
            # Solapamiento [hora_inicio, hora_fin) con la reserva.
            stmt = stmt.where(Reserva.hora_inicio < hora_fin, Reserva.hora_fin > hora_inicio)
        return list(self.db.execute(stmt.order_by(Reserva.fecha, Reserva.hora_inicio)).unique().scalars().all())

    def por_ids(self, ids: list[int]) -> list[Reserva]:
        if not ids:
            return []
        return list(self.db.execute(select(Reserva).where(Reserva.id.in_(ids))).scalars().all())

    def buscar(self, nombre: str | None = None, correo: str | None = None,
               fecha: date | None = None, agenda_id: int | None = None,
               servicio_id: int | None = None, estado: str | None = None,
               limite: int = 2000) -> list[Reserva]:
        """Búsqueda administrativa por nombre/correo/fecha/agenda/evento. Filtra
        nombre/correo contra la foto tomada en la propia reserva (no un join a `usuarios`)
        para que las reservas de una cuenta ya eliminada sigan siendo buscables."""
        stmt = _con_detalle(select(Reserva))
        if servicio_id:
            stmt = stmt.where(Reserva.servicio_id == servicio_id)
        if estado:
            stmt = stmt.where(Reserva.estado == estado)
        if nombre:
            stmt = stmt.where(
                or_(Reserva.usuario_nombre.icontains(nombre), Reserva.usuario_apellido.icontains(nombre))
            )
        if correo:
            stmt = stmt.where(Reserva.usuario_correo.icontains(correo))
        if fecha:
            stmt = stmt.where(Reserva.fecha == fecha)
        if agenda_id:
            stmt = stmt.where(Reserva.agenda_id == agenda_id)
        stmt = stmt.order_by(Reserva.fecha.desc(), Reserva.hora_inicio.desc()).limit(limite)
        return list(self.db.execute(stmt).scalars().all())

    def mias(self, usuario_id: int) -> list[Reserva]:
        """Reservas propias de un usuario autenticado (histórico completo, todos los estados)."""
        return list(
            self.db.execute(
                _con_detalle(select(Reserva))
                .where(Reserva.usuario_id == usuario_id)
                .order_by(Reserva.fecha.desc(), Reserva.hora_inicio.desc())
            ).scalars().all()
        )

    def activas_desde(self, fecha_inicio: date, fecha_fin: date) -> list[Reserva]:
        """Reservas activas de un rango de fechas que todavía no han ocurrido (para el
        reinicio semanal: lo ya ocurrido queda pendiente de marcar asistencia)."""
        stmt = select(Reserva).where(
            Reserva.fecha >= fecha_inicio,
            Reserva.fecha <= fecha_fin,
            Reserva.estado == EstadoReserva.ACTIVA.value,
        )
        return list(self.db.execute(_solo_futuras(stmt)).scalars().all())
