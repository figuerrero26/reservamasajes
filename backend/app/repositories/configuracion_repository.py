from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ConfiguracionGeneral


class ConfiguracionRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, clave: str) -> str | None:
        row = self.db.execute(
            select(ConfiguracionGeneral).where(ConfiguracionGeneral.clave == clave)
        ).scalar_one_or_none()
        return row.valor if row else None

    def get_all(self) -> dict[str, str | None]:
        rows = self.db.execute(select(ConfiguracionGeneral)).scalars().all()
        return {r.clave: r.valor for r in rows}

    def set(self, clave: str, valor: str | None) -> None:
        row = self.db.execute(
            select(ConfiguracionGeneral).where(ConfiguracionGeneral.clave == clave)
        ).scalar_one_or_none()
        if row:
            row.valor = valor
        else:
            self.db.add(ConfiguracionGeneral(clave=clave, valor=valor))
        self.db.flush()
