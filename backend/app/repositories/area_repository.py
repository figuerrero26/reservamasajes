from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Area
from app.repositories.base import BaseRepository


class AreaRepository(BaseRepository[Area]):
    def __init__(self, db: Session):
        super().__init__(Area, db)

    def by_nombre(self, nombre: str) -> Area | None:
        return self.db.execute(select(Area).where(Area.nombre == nombre)).scalar_one_or_none()
