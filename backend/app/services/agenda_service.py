from sqlalchemy.orm import Session

from app.models import Agenda
from app.repositories.agenda_repository import AgendaRepository
from app.schemas.agenda import AgendaCreate, AgendaUpdate
from app.services import auditoria_service
from app.services.errors import NotFound


class AgendaService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = AgendaRepository(db)

    def listar(self) -> list[Agenda]:
        return self.repo.list()

    def listar_activas(self) -> list[Agenda]:
        return self.repo.list_activas()

    def obtener(self, agenda_id: int) -> Agenda:
        agenda = self.repo.get(agenda_id)
        if not agenda:
            raise NotFound("Agenda no encontrada")
        return agenda

    def crear(self, data: AgendaCreate, actor: str) -> Agenda:
        agenda = self.repo.add(Agenda(**data.model_dump()))
        auditoria_service.registrar(self.db, actor, "crear", "agenda", agenda.id, data.nombre)
        self.db.commit()
        return agenda

    def actualizar(self, agenda_id: int, data: AgendaUpdate, actor: str) -> Agenda:
        agenda = self.obtener(agenda_id)
        for k, v in data.model_dump(exclude_unset=True).items():
            setattr(agenda, k, v)
        auditoria_service.registrar(self.db, actor, "editar", "agenda", agenda.id)
        self.db.commit()
        return agenda

    def cambiar_estado(self, agenda_id: int, activa: bool, actor: str) -> Agenda:
        agenda = self.obtener(agenda_id)
        agenda.estado = activa
        auditoria_service.registrar(
            self.db, actor, "activar" if activa else "desactivar", "agenda", agenda.id
        )
        self.db.commit()
        return agenda
