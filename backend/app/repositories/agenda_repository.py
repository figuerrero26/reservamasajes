from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Agenda
from app.repositories.base import BaseRepository


class AgendaRepository(BaseRepository[Agenda]):
    def __init__(self, db: Session):
        super().__init__(Agenda, db)

    def list_activas(self, servicio_id: int | None = None) -> list[Agenda]:
        stmt = select(Agenda).where(Agenda.activo.is_(True))
        if servicio_id:
            stmt = stmt.where(Agenda.servicio_id == servicio_id)
        return list(self.db.execute(stmt).scalars().all())
