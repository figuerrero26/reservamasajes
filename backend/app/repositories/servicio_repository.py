from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Agenda, Servicio
from app.repositories.base import BaseRepository


class ServicioRepository(BaseRepository[Servicio]):
    def __init__(self, db: Session):
        super().__init__(Servicio, db)

    def listar(self, area_id: int | None = None) -> list[Servicio]:
        """Eventos por turnos; con `area_id`, solo los que tienen al menos una agenda en esa
        área (la relación evento–área vive en las agendas)."""
        stmt = select(Servicio).order_by(Servicio.nombre)
        if area_id:
            stmt = stmt.where(Servicio.id.in_(select(Agenda.servicio_id).where(Agenda.area_id == area_id)))
        return list(self.db.execute(stmt).scalars().all())

    def by_nombre(self, nombre: str) -> Servicio | None:
        return self.db.execute(
            select(Servicio).where(Servicio.nombre == nombre)
        ).scalar_one_or_none()
