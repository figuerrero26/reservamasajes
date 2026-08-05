"""Repositorio genérico con operaciones CRUD comunes."""
from typing import Generic, TypeVar

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.base import Base

ModelType = TypeVar("ModelType", bound=Base)


class BaseRepository(Generic[ModelType]):
    def __init__(self, model: type[ModelType], db: Session):
        self.model = model
        self.db = db

    def get(self, obj_id: int) -> ModelType | None:
        return self.db.get(self.model, obj_id)

    def list(self) -> list[ModelType]:
        return list(self.db.execute(select(self.model)).scalars().all())

    def add(self, obj: ModelType) -> ModelType:
        self.db.add(obj)
        self.db.flush()
        return obj

    def delete(self, obj: ModelType) -> None:
        self.db.delete(obj)
        self.db.flush()
