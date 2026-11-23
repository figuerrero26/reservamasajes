from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.models import Actividad
from app.repositories.base import BaseRepository


class ActividadRepository(BaseRepository[Actividad]):
    def __init__(self, db: Session):
        super().__init__(Actividad, db)

    def _listar(self, *, solo_activas: bool, area_id: int | None):
        stmt = select(Actividad).options(joinedload(Actividad.area)).order_by(Actividad.nombre)
        if solo_activas:
            stmt = stmt.where(Actividad.activo.is_(True))
        if area_id:
            stmt = stmt.where(Actividad.area_id == area_id)
        return list(self.db.execute(stmt).scalars().all())

    def list_activas(self, area_id: int | None = None) -> list[Actividad]:
        return self._listar(solo_activas=True, area_id=area_id)

    def list_all(self, area_id: int | None = None) -> list[Actividad]:
        return self._listar(solo_activas=False, area_id=area_id)

    def contar_activas_por_area(self, area_id: int) -> int:
        return self.db.execute(
            select(func.count()).select_from(Actividad).where(Actividad.area_id == area_id, Actividad.activo.is_(True))
        ).scalar_one()
