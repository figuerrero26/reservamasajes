from datetime import date

from sqlalchemy.orm import Session

from app.models import Bloqueo
from app.repositories.bloqueo_repository import BloqueoRepository
from app.schemas.bloqueo import BloqueoCreate
from app.services import auditoria_service
from app.services.errors import NotFound

CAMPOS = ["id", "agenda_id", "tipo", "fecha", "hora_inicio", "hora_fin", "motivo"]


class BloqueoService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = BloqueoRepository(db)

    def listar(self, fecha: date | None = None) -> list[Bloqueo]:
        bloqueos = self.repo.list()
        if fecha:
            bloqueos = [b for b in bloqueos if b.fecha == fecha]
        return bloqueos

    def crear(self, data: BloqueoCreate, admin_id: int) -> Bloqueo:
        bloqueo = Bloqueo(**data.model_dump(), creado_por=admin_id)
        self.repo.add(bloqueo)
        auditoria_service.registrar(
            self.db, admin_id, "crear", "bloqueo", bloqueo.id,
            datos_nuevos=auditoria_service.snapshot(bloqueo, CAMPOS),
        )
        self.db.commit()
        return bloqueo

    def eliminar(self, bloqueo_id: int, admin_id: int) -> None:
        bloqueo = self.repo.get(bloqueo_id)
        if not bloqueo:
            raise NotFound("Bloqueo no encontrado")
        anteriores = auditoria_service.snapshot(bloqueo, CAMPOS)
        self.repo.delete(bloqueo)
        auditoria_service.registrar(
            self.db, admin_id, "eliminar", "bloqueo", bloqueo_id, datos_anteriores=anteriores,
        )
        self.db.commit()
