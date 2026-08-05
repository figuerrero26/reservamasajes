from sqlalchemy.orm import Session

from app.models import Servicio
from app.repositories.servicio_repository import ServicioRepository
from app.schemas.servicio import ServicioCreate, ServicioUpdate
from app.services import auditoria_service
from app.services.errors import Conflict, NotFound


class ServicioService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = ServicioRepository(db)

    def listar(self) -> list[Servicio]:
        return self.repo.list()

    def crear(self, data: ServicioCreate, actor: str) -> Servicio:
        if self.repo.by_nombre(data.nombre):
            raise Conflict("Ya existe un servicio con ese nombre")
        serv = self.repo.add(Servicio(**data.model_dump()))
        auditoria_service.registrar(self.db, actor, "crear", "servicio", serv.id, data.nombre)
        self.db.commit()
        return serv

    def actualizar(self, servicio_id: int, data: ServicioUpdate, actor: str) -> Servicio:
        serv = self.repo.get(servicio_id)
        if not serv:
            raise NotFound("Servicio no encontrado")
        for k, v in data.model_dump(exclude_unset=True).items():
            setattr(serv, k, v)
        auditoria_service.registrar(self.db, actor, "editar", "servicio", serv.id)
        self.db.commit()
        return serv

    def eliminar(self, servicio_id: int, actor: str) -> None:
        serv = self.repo.get(servicio_id)
        if not serv:
            raise NotFound("Servicio no encontrado")
        self.repo.delete(serv)
        auditoria_service.registrar(self.db, actor, "eliminar", "servicio", servicio_id)
        self.db.commit()
