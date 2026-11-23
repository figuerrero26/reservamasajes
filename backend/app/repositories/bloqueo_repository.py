from datetime import date

from sqlalchemy import select, or_
from sqlalchemy.orm import Session

from app.models import Bloqueo, Festivo
from app.repositories.base import BaseRepository


class BloqueoRepository(BaseRepository[Bloqueo]):
    def __init__(self, db: Session):
        super().__init__(Bloqueo, db)

    def listar(self, fecha: date | None = None) -> list[Bloqueo]:
        stmt = select(Bloqueo)
        if fecha:
            stmt = stmt.where(Bloqueo.fecha == fecha)
        return list(self.db.execute(stmt.order_by(Bloqueo.fecha.desc(), Bloqueo.hora_inicio)).scalars().all())

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
            select(Festivo.id).where(Festivo.fecha == fecha, Festivo.estado.is_(True))
        ).first() is not None

    def por_fechas(self, fechas: list[date]) -> list[Bloqueo]:
        """Bloqueos (de cualquier agenda o globales) de varias fechas, en una consulta."""
        if not fechas:
            return []
        return list(self.db.execute(select(Bloqueo).where(Bloqueo.fecha.in_(fechas))).scalars().all())

    def festivos_en(self, fechas: list[date]) -> set[date]:
        if not fechas:
            return set()
        return set(self.db.execute(
            select(Festivo.fecha).where(Festivo.fecha.in_(fechas), Festivo.estado.is_(True))
        ).scalars().all())
