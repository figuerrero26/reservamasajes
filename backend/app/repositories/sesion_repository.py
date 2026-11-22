from datetime import date, time

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.models import Sesion
from app.repositories.base import BaseRepository
from app.utils.time import now


def _futuras(stmt):
    ahora = now()
    return stmt.where(
        or_(
            Sesion.fecha > ahora.date(),
            and_(Sesion.fecha == ahora.date(), Sesion.hora_inicio > ahora.time()),
        )
    )


class SesionRepository(BaseRepository[Sesion]):
    def __init__(self, db: Session):
        super().__init__(Sesion, db)

    def por_actividad(
        self, actividad_id: int, *, solo_activas: bool = False, solo_futuras: bool = False,
    ) -> list[Sesion]:
        stmt = select(Sesion).where(Sesion.actividad_id == actividad_id)
        if solo_activas:
            stmt = stmt.where(Sesion.activa.is_(True))
        if solo_futuras:
            stmt = _futuras(stmt)
        return list(self.db.execute(stmt.order_by(Sesion.fecha, Sesion.hora_inicio)).scalars().all())

    def futuras_activas_por_actividades(self, actividad_ids: list[int]) -> dict[int, list[Sesion]]:
        """Sesiones activas que todavía no empiezan, agrupadas por actividad (una consulta)."""
        if not actividad_ids:
            return {}
        stmt = _futuras(select(Sesion).where(Sesion.actividad_id.in_(actividad_ids), Sesion.activa.is_(True)))
        agrupadas: dict[int, list[Sesion]] = {}
        for s in self.db.execute(stmt.order_by(Sesion.fecha, Sesion.hora_inicio)).scalars().all():
            agrupadas.setdefault(s.actividad_id, []).append(s)
        return agrupadas

    def existe(self, actividad_id: int, fecha: date, hora_inicio: time) -> bool:
        return self.db.execute(
            select(Sesion.id).where(
                Sesion.actividad_id == actividad_id, Sesion.fecha == fecha, Sesion.hora_inicio == hora_inicio,
            )
        ).first() is not None

    def get_for_update(self, sesion_id: int) -> Sesion | None:
        """Bloquea la fila de la sesión durante la transacción: necesario para contar cupos
        de forma segura ante inscripciones concurrentes (ver InscripcionService._crear)."""
        return self.db.execute(
            select(Sesion).where(Sesion.id == sesion_id).with_for_update()
        ).scalar_one_or_none()

    def crear_lote(self, sesiones: list[Sesion]) -> list[Sesion]:
        self.db.add_all(sesiones)
        self.db.flush()
        return sesiones
