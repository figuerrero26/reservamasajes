from sqlalchemy import select, or_
from sqlalchemy.orm import Session

from app.models import Usuario
from app.repositories.base import BaseRepository


class UsuarioRepository(BaseRepository[Usuario]):
    def __init__(self, db: Session):
        super().__init__(Usuario, db)

    def by_correo(self, correo: str) -> Usuario | None:
        return self.db.execute(
            select(Usuario).where(Usuario.correo == correo)
        ).scalar_one_or_none()

    def buscar(self, nombre: str | None = None, correo: str | None = None) -> list[Usuario]:
        stmt = select(Usuario)
        if nombre:
            stmt = stmt.where(
                or_(Usuario.nombre.icontains(nombre), Usuario.apellido.icontains(nombre))
            )
        if correo:
            stmt = stmt.where(Usuario.correo.icontains(correo))
        return list(self.db.execute(stmt.order_by(Usuario.nombre, Usuario.apellido)).scalars().all())
