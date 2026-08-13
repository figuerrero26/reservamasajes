from sqlalchemy.orm import Session

from app.models import Agenda
from app.repositories.agenda_repository import AgendaRepository
from app.repositories.area_repository import AreaRepository
from app.repositories.servicio_repository import ServicioRepository
from app.schemas.agenda import AgendaCreate, AgendaUpdate
from app.services import auditoria_service
from app.services.auditoria_service import snapshot
from app.services.errors import DomainError, NotFound

CAMPOS = [
    "id", "nombre", "area_id", "servicio_id", "hora_inicio", "hora_fin",
    "almuerzo_inicio", "almuerzo_fin", "duracion_minutos", "dias_habilitados", "activo",
]


class AgendaService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = AgendaRepository(db)
        self.areas = AreaRepository(db)
        self.servicios = ServicioRepository(db)

    def listar(self) -> list[Agenda]:
        return self.repo.list()

    def listar_activas(self, servicio_id: int | None = None) -> list[Agenda]:
        return self.repo.list_activas(servicio_id=servicio_id)

    def obtener(self, agenda_id: int) -> Agenda:
        agenda = self.repo.get(agenda_id)
        if not agenda:
            raise NotFound("Agenda no encontrada")
        return agenda

    def _validar_referencias(self, area_id: int, servicio_id: int) -> None:
        area = self.areas.get(area_id)
        if not area or not area.activo:
            raise DomainError("El área seleccionada no existe o está inactiva")
        servicio = self.servicios.get(servicio_id)
        if not servicio or not servicio.activo:
            raise DomainError("El servicio seleccionado no existe o está inactivo")

    def crear(self, data: AgendaCreate, admin_id: int) -> Agenda:
        self._validar_referencias(data.area_id, data.servicio_id)
        agenda = self.repo.add(Agenda(**data.model_dump()))
        auditoria_service.registrar(
            self.db, admin_id, "crear", "agenda", agenda.id, datos_nuevos=snapshot(agenda, CAMPOS),
        )
        self.db.commit()
        return agenda

    def actualizar(self, agenda_id: int, data: AgendaUpdate, admin_id: int) -> Agenda:
        agenda = self.obtener(agenda_id)
        cambios = data.model_dump(exclude_unset=True)
        area_id = cambios.get("area_id", agenda.area_id)
        servicio_id = cambios.get("servicio_id", agenda.servicio_id)
        if "area_id" in cambios or "servicio_id" in cambios:
            self._validar_referencias(area_id, servicio_id)
        anteriores = snapshot(agenda, CAMPOS)
        for k, v in cambios.items():
            setattr(agenda, k, v)
        if agenda.hora_fin <= agenda.hora_inicio:
            raise DomainError("hora_fin debe ser posterior a hora_inicio")
        if (agenda.almuerzo_inicio is None) != (agenda.almuerzo_fin is None):
            raise DomainError("almuerzo_inicio y almuerzo_fin deben definirse juntos")
        if agenda.almuerzo_inicio and agenda.almuerzo_fin and agenda.almuerzo_fin <= agenda.almuerzo_inicio:
            raise DomainError("almuerzo_fin debe ser posterior a almuerzo_inicio")
        auditoria_service.registrar(
            self.db, admin_id, "editar", "agenda", agenda.id,
            datos_anteriores=anteriores, datos_nuevos=snapshot(agenda, CAMPOS),
        )
        self.db.commit()
        return agenda

    def cambiar_estado(self, agenda_id: int, activa: bool, admin_id: int) -> Agenda:
        agenda = self.obtener(agenda_id)
        anteriores = snapshot(agenda, CAMPOS)
        agenda.activo = activa
        auditoria_service.registrar(
            self.db, admin_id, "activar" if activa else "desactivar", "agenda", agenda.id,
            datos_anteriores=anteriores, datos_nuevos=snapshot(agenda, CAMPOS),
        )
        self.db.commit()
        return agenda
