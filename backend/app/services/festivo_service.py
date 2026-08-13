from sqlalchemy.orm import Session

from app.models import Festivo
from app.repositories.festivo_repository import FestivoRepository
from app.schemas.festivo import FestivoCreate, FestivoUpdate
from app.services import auditoria_service
from app.services.errors import Conflict, NotFound

CAMPOS = ["id", "fecha", "nombre", "descripcion", "estado"]


class FestivoService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = FestivoRepository(db)

    def listar(self) -> list[Festivo]:
        return self.repo.list()

    def crear(self, data: FestivoCreate, admin_id: int) -> Festivo:
        if self.repo.by_fecha(data.fecha):
            raise Conflict("Ya existe un festivo registrado para esa fecha")
        festivo = self.repo.add(Festivo(**data.model_dump()))
        auditoria_service.registrar(
            self.db, admin_id, "crear", "festivo", festivo.id,
            datos_nuevos=auditoria_service.snapshot(festivo, CAMPOS),
        )
        self.db.commit()
        return festivo

    def actualizar(self, festivo_id: int, data: FestivoUpdate, admin_id: int) -> Festivo:
        festivo = self.repo.get(festivo_id)
        if not festivo:
            raise NotFound("Festivo no encontrado")
        anteriores = auditoria_service.snapshot(festivo, CAMPOS)
        for k, v in data.model_dump(exclude_unset=True).items():
            setattr(festivo, k, v)
        auditoria_service.registrar(
            self.db, admin_id, "editar", "festivo", festivo.id,
            datos_anteriores=anteriores, datos_nuevos=auditoria_service.snapshot(festivo, CAMPOS),
        )
        self.db.commit()
        return festivo

    def eliminar(self, festivo_id: int, admin_id: int) -> None:
        festivo = self.repo.get(festivo_id)
        if not festivo:
            raise NotFound("Festivo no encontrado")
        anteriores = auditoria_service.snapshot(festivo, CAMPOS)
        self.repo.delete(festivo)
        auditoria_service.registrar(
            self.db, admin_id, "eliminar", "festivo", festivo_id, datos_anteriores=anteriores,
        )
        self.db.commit()
