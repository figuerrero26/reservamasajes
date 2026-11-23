from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models import Agenda, Area, Servicio
from app.repositories.base import BaseRepository


class AgendaRepository(BaseRepository[Agenda]):
    def __init__(self, db: Session):
        super().__init__(Agenda, db)

    def listar_ordenadas(self, area_id: int | None = None, servicio_id: int | None = None) -> list[Agenda]:
        stmt = select(Agenda).order_by(Agenda.nombre)
        if area_id:
            stmt = stmt.where(Agenda.area_id == area_id)
        if servicio_id:
            stmt = stmt.where(Agenda.servicio_id == servicio_id)
        return list(self.db.execute(stmt).scalars().all())

    def list_activas(self, servicio_id: int | None = None) -> list[Agenda]:
        """Agendas con su propio flag activo (sin mirar evento ni área): vista administrativa."""
        stmt = select(Agenda).options(joinedload(Agenda.area), joinedload(Agenda.servicio)).where(Agenda.activo.is_(True))
        if servicio_id:
            stmt = stmt.where(Agenda.servicio_id == servicio_id)
        return list(self.db.execute(stmt).scalars().all())

    def list_reservables(self, servicio_id: int | None = None) -> list[Agenda]:
        """Agendas que el portal público puede ofrecer: la agenda, su evento y su área
        activos (misma regla que horario_service.agenda_reservable, resuelta en SQL)."""
        stmt = (
            select(Agenda)
            .join(Servicio, Agenda.servicio_id == Servicio.id)
            .join(Area, Agenda.area_id == Area.id)
            .options(joinedload(Agenda.area), joinedload(Agenda.servicio))
            .where(Agenda.activo.is_(True), Servicio.activo.is_(True), Area.activo.is_(True))
            .order_by(Area.nombre)
        )
        if servicio_id:
            stmt = stmt.where(Agenda.servicio_id == servicio_id)
        return list(self.db.execute(stmt).scalars().all())

    def por_area_servicio(self, area_id: int, servicio_id: int) -> Agenda | None:
        return self.db.execute(
            select(Agenda).where(Agenda.area_id == area_id, Agenda.servicio_id == servicio_id)
        ).scalar_one_or_none()
