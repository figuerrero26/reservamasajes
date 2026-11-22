from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.models import EstadoInscripcion, Inscripcion, Sesion
from app.repositories.base import BaseRepository


class InscripcionRepository(BaseRepository[Inscripcion]):
    def __init__(self, db: Session):
        super().__init__(Inscripcion, db)

    def activa_por_usuario_sesion(self, usuario_id: int, sesion_id: int) -> Inscripcion | None:
        return self.db.execute(
            select(Inscripcion).where(
                Inscripcion.usuario_id == usuario_id,
                Inscripcion.sesion_id == sesion_id,
                Inscripcion.estado == EstadoInscripcion.ACTIVA.value,
            )
        ).scalars().first()

    def contar_activas_por_sesion(self, sesion_id: int) -> int:
        return self.db.execute(
            select(func.count()).select_from(Inscripcion).where(
                Inscripcion.sesion_id == sesion_id,
                Inscripcion.estado == EstadoInscripcion.ACTIVA.value,
            )
        ).scalar_one()

    def contar_activas_por_sesiones(self, sesion_ids: list[int]) -> dict[int, int]:
        """Inscritos activos de varias sesiones en UNA consulta (evita N+1 en los listados)."""
        if not sesion_ids:
            return {}
        filas = self.db.execute(
            select(Inscripcion.sesion_id, func.count())
            .where(Inscripcion.sesion_id.in_(sesion_ids), Inscripcion.estado == EstadoInscripcion.ACTIVA.value)
            .group_by(Inscripcion.sesion_id)
        ).all()
        return {sesion_id: total for sesion_id, total in filas}

    def sesiones_inscritas(self, usuario_id: int, sesion_ids: list[int]) -> set[int]:
        """De las sesiones dadas, en cuáles tiene el usuario una inscripción activa."""
        if not sesion_ids:
            return set()
        return set(self.db.execute(
            select(Inscripcion.sesion_id).where(
                Inscripcion.usuario_id == usuario_id,
                Inscripcion.sesion_id.in_(sesion_ids),
                Inscripcion.estado == EstadoInscripcion.ACTIVA.value,
            )
        ).scalars().all())

    def mias(self, usuario_id: int) -> list[Inscripcion]:
        return list(
            self.db.execute(
                select(Inscripcion)
                .options(joinedload(Inscripcion.sesion).joinedload(Sesion.actividad))
                .where(Inscripcion.usuario_id == usuario_id)
                .order_by(Inscripcion.created_at.desc())
            ).scalars().all()
        )

    def buscar(
        self, nombre: str | None = None, correo: str | None = None,
        actividad_id: int | None = None, sesion_id: int | None = None, estado: str | None = None,
        limite: int = 2000,
    ) -> list[Inscripcion]:
        """Búsqueda administrativa, mismo patrón que ReservaRepository.buscar: filtra
        nombre/correo contra la foto de identidad propia (no un join a usuarios), para que
        las inscripciones de una cuenta ya eliminada sigan apareciendo."""
        stmt = select(Inscripcion).options(
            joinedload(Inscripcion.sesion).joinedload(Sesion.actividad),
        )
        if actividad_id:
            stmt = stmt.join(Sesion, Inscripcion.sesion_id == Sesion.id).where(Sesion.actividad_id == actividad_id)
        if sesion_id:
            stmt = stmt.where(Inscripcion.sesion_id == sesion_id)
        if estado:
            stmt = stmt.where(Inscripcion.estado == estado)
        if nombre:
            stmt = stmt.where(
                or_(Inscripcion.usuario_nombre.icontains(nombre), Inscripcion.usuario_apellido.icontains(nombre))
            )
        if correo:
            stmt = stmt.where(Inscripcion.usuario_correo.icontains(correo))
        stmt = stmt.order_by(Inscripcion.created_at.desc()).limit(limite)
        return list(self.db.execute(stmt).scalars().all())
