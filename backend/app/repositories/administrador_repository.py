from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Administrador
from app.repositories.base import BaseRepository


class AdministradorRepository(BaseRepository[Administrador]):
    def __init__(self, db: Session):
        super().__init__(Administrador, db)

    def by_usuario(self, usuario: str) -> Administrador | None:
        return self.db.execute(
            select(Administrador).where(Administrador.usuario == usuario)
        ).scalar_one_or_none()
