from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Reserva, EstadoReserva
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
