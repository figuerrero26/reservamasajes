from datetime import date

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.models import Sesion
from app.repositories.base import BaseRepository
from app.utils.time import now


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
            ahora = now()
            stmt = stmt.where(
                or_(
                    Sesion.fecha > ahora.date(),
                    and_(Sesion.fecha == ahora.date(), Sesion.hora_inicio > ahora.time()),
                )
            )
        return list(self.db.execute(stmt.order_by(Sesion.fecha, Sesion.hora_inicio)).scalars().all())

    def get_for_update(self, sesion_id: int) -> Sesion | None:
        """Bloquea la fila de la sesión durante la transacción: necesario para contar cupos
        de forma segura ante inscripciones concurrentes (ver InscripcionService._crear)."""
        return self.db.execute(
            select(Sesion).where(Sesion.id == sesion_id).with_for_update()
        ).scalar_one_or_none()

    def crear_lote(
        self, actividad_id: int, fechas: list[date], hora_inicio, hora_fin, cupo_maximo: int | None,
    ) -> list[Sesion]:
        sesiones = [
            Sesion(
                actividad_id=actividad_id, fecha=f, hora_inicio=hora_inicio, hora_fin=hora_fin,
                cupo_maximo=cupo_maximo,
            )
            for f in fechas
        ]
        self.db.add_all(sesiones)
        self.db.flush()
        return sesiones
