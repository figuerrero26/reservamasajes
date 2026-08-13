from datetime import date

from sqlalchemy import select, or_
from sqlalchemy.orm import Session

from app.models import Reserva, EstadoReserva, Usuario
from app.repositories.base import BaseRepository


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
        """Regla: como máximo una reserva activa por usuario+evento+día (sin importar hora
        ni agenda/área)."""
        return self.db.execute(
            select(Reserva).where(
                Reserva.usuario_id == usuario_id,
                Reserva.servicio_id == servicio_id,
                Reserva.fecha == fecha,
                Reserva.estado == EstadoReserva.ACTIVA.value,
            )
        ).scalar_one_or_none()

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

    def buscar(self, nombre: str | None = None, correo: str | None = None,
               fecha: date | None = None, agenda_id: int | None = None) -> list[Reserva]:
        """Búsqueda administrativa por nombre/correo/fecha/agenda (uso interno, no público)."""
        stmt = select(Reserva).join(Usuario, Reserva.usuario_id == Usuario.id)
        if nombre:
            stmt = stmt.where(
                or_(Usuario.nombre.icontains(nombre), Usuario.apellido.icontains(nombre))
            )
        if correo:
            stmt = stmt.where(Usuario.correo.icontains(correo))
        if fecha:
            stmt = stmt.where(Reserva.fecha == fecha)
        if agenda_id:
            stmt = stmt.where(Reserva.agenda_id == agenda_id)
        stmt = stmt.order_by(Reserva.fecha.desc(), Reserva.hora_inicio.desc())
        return list(self.db.execute(stmt).scalars().all())

    def mias(self, usuario_id: int) -> list[Reserva]:
        """Reservas propias de un usuario autenticado (histórico completo, todos los estados)."""
        return list(
            self.db.execute(
                select(Reserva)
                .where(Reserva.usuario_id == usuario_id)
                .order_by(Reserva.fecha.desc(), Reserva.hora_inicio.desc())
            ).scalars().all()
        )
