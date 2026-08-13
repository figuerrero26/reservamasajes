from sqlalchemy.orm import Session

from app.models import Area
from app.repositories.area_repository import AreaRepository
from app.schemas.area import AreaCreate, AreaUpdate
from app.services import auditoria_service
from app.services.auditoria_service import snapshot
from app.services.errors import Conflict, NotFound

CAMPOS = ["id", "nombre", "descripcion", "activo"]


class AreaService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = AreaRepository(db)

    def listar(self) -> list[Area]:
        return self.repo.list()

    def crear(self, data: AreaCreate, admin_id: int) -> Area:
        if self.repo.by_nombre(data.nombre):
            raise Conflict("Ya existe un área con ese nombre")
        area = self.repo.add(Area(**data.model_dump()))
        auditoria_service.registrar(
            self.db, admin_id, "crear", "area", area.id, datos_nuevos=snapshot(area, CAMPOS),
        )
        self.db.commit()
        return area

    def actualizar(self, area_id: int, data: AreaUpdate, admin_id: int) -> Area:
        area = self.repo.get(area_id)
        if not area:
            raise NotFound("Área no encontrada")
        anteriores = snapshot(area, CAMPOS)
        for k, v in data.model_dump(exclude_unset=True).items():
            setattr(area, k, v)
        auditoria_service.registrar(
            self.db, admin_id, "editar", "area", area.id,
            datos_anteriores=anteriores, datos_nuevos=snapshot(area, CAMPOS),
        )
        self.db.commit()
        return area

    def desactivar(self, area_id: int, admin_id: int) -> Area:
        """Baja lógica: un área con agendas asociadas conserva su historial (no se borra)."""
        area = self.repo.get(area_id)
        if not area:
            raise NotFound("Área no encontrada")
        anteriores = snapshot(area, CAMPOS)
        area.activo = False
        auditoria_service.registrar(
            self.db, admin_id, "desactivar", "area", area_id,
            datos_anteriores=anteriores, datos_nuevos=snapshot(area, CAMPOS),
        )
        self.db.commit()
        return area
