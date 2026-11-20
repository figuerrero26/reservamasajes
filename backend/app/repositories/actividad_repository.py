from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Actividad
from app.repositories.base import BaseRepository


class ActividadRepository(BaseRepository[Actividad]):
    def __init__(self, db: Session):
        super().__init__(Actividad, db)

    def list_activas(self) -> list[Actividad]:
        return list(
            self.db.execute(
                select(Actividad).where(Actividad.activo.is_(True)).order_by(Actividad.nombre)
            ).scalars().all()
        )

    def list_all(self) -> list[Actividad]:
        return list(self.db.execute(select(Actividad).order_by(Actividad.nombre)).scalars().all())
