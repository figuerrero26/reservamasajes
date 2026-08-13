from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Festivo
from app.repositories.base import BaseRepository


class FestivoRepository(BaseRepository[Festivo]):
    def __init__(self, db: Session):
        super().__init__(Festivo, db)

    def by_fecha(self, fecha: date) -> Festivo | None:
        return self.db.execute(
            select(Festivo).where(Festivo.fecha == fecha)
        ).scalar_one_or_none()
