from sqlalchemy.orm import Session

from app.models import Area
from app.repositories.area_repository import AreaRepository
from app.schemas.area import AreaCreate, AreaUpdate
from app.services import auditoria_service
from app.services.errors import Conflict, NotFound


class AreaService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = AreaRepository(db)

    def listar(self) -> list[Area]:
        return self.repo.list()

    def crear(self, data: AreaCreate, actor: str) -> Area:
        if self.repo.by_nombre(data.nombre):
            raise Conflict("Ya existe un área con ese nombre")
        area = self.repo.add(Area(**data.model_dump()))
        auditoria_service.registrar(self.db, actor, "crear", "area", area.id, data.nombre)
        self.db.commit()
        return area

    def actualizar(self, area_id: int, data: AreaUpdate, actor: str) -> Area:
        area = self.repo.get(area_id)
        if not area:
            raise NotFound("Área no encontrada")
        for k, v in data.model_dump(exclude_unset=True).items():
            setattr(area, k, v)
        auditoria_service.registrar(self.db, actor, "editar", "area", area.id)
        self.db.commit()
        return area

    def eliminar(self, area_id: int, actor: str) -> None:
        area = self.repo.get(area_id)
        if not area:
            raise NotFound("Área no encontrada")
        self.repo.delete(area)
        auditoria_service.registrar(self.db, actor, "eliminar", "area", area_id)
        self.db.commit()
