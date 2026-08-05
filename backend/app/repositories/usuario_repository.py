from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Usuario
from app.repositories.base import BaseRepository


class UsuarioRepository(BaseRepository[Usuario]):
    def __init__(self, db: Session):
        super().__init__(Usuario, db)

    def by_cedula(self, cedula: str) -> Usuario | None:
        return self.db.execute(
            select(Usuario).where(Usuario.cedula == cedula)
        ).scalar_one_or_none()
