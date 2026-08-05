from datetime import date

from sqlalchemy import select, or_
from sqlalchemy.orm import Session

from app.models import Bloqueo, Festivo
from app.repositories.base import BaseRepository


class BloqueoRepository(BaseRepository[Bloqueo]):
    def __init__(self, db: Session):
        super().__init__(Bloqueo, db)

    def por_agenda_fecha(self, agenda_id: int, fecha: date) -> list[Bloqueo]:
        return list(
            self.db.execute(
                select(Bloqueo).where(
                    Bloqueo.fecha == fecha,
                    or_(Bloqueo.agenda_id == agenda_id, Bloqueo.agenda_id.is_(None)),
                )
            ).scalars().all()
        )

    def es_festivo(self, fecha: date) -> bool:
        return self.db.execute(
            select(Festivo).where(Festivo.fecha == fecha)
        ).scalar_one_or_none() is not None
