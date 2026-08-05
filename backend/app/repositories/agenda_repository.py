from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Agenda
from app.repositories.base import BaseRepository


class AgendaRepository(BaseRepository[Agenda]):
    def __init__(self, db: Session):
        super().__init__(Agenda, db)

    def list_activas(self) -> list[Agenda]:
        return list(
            self.db.execute(select(Agenda).where(Agenda.estado.is_(True))).scalars().all()
        )
