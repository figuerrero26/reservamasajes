from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Servicio
from app.repositories.base import BaseRepository


class ServicioRepository(BaseRepository[Servicio]):
    def __init__(self, db: Session):
        super().__init__(Servicio, db)

    def by_nombre(self, nombre: str) -> Servicio | None:
        return self.db.execute(
            select(Servicio).where(Servicio.nombre == nombre)
        ).scalar_one_or_none()
