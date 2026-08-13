from sqlalchemy.orm import Session

from app.models import Servicio
from app.repositories.agenda_repository import AgendaRepository
from app.repositories.servicio_repository import ServicioRepository
from app.schemas.evento import AgendaResumen, EventoPublico
from app.schemas.servicio import ServicioCreate, ServicioUpdate
from app.services import auditoria_service
from app.services.auditoria_service import snapshot
from app.services.errors import Conflict, NotFound

CAMPOS = [
    "id", "nombre", "descripcion_corta", "descripcion_larga", "imagen_url",
    "duracion_minutos", "informacion_adicional", "activo",
]


class ServicioService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = ServicioRepository(db)
        self.agendas = AgendaRepository(db)

    def listar(self) -> list[Servicio]:
        return self.repo.list()

    def _a_evento_publico(self, servicio: Servicio) -> EventoPublico | None:
        if not servicio.activo:
            return None
        agendas = self.agendas.list_activas(servicio_id=servicio.id)
        if not agendas:
            return None
        areas_vistas: dict[int, str] = {}
        resumen_agendas: list[AgendaResumen] = []
        for agenda in agendas:
            areas_vistas[agenda.area_id] = agenda.area_nombre
            resumen_agendas.append(AgendaResumen(
                id=agenda.id, area_id=agenda.area_id, area_nombre=agenda.area_nombre,
            ))
        return EventoPublico(
            id=servicio.id,
            nombre=servicio.nombre,
            descripcion_corta=servicio.descripcion_corta,
            descripcion_larga=servicio.descripcion_larga,
            imagen_url=servicio.imagen_url,
            duracion_minutos=servicio.duracion_minutos,
            informacion_adicional=servicio.informacion_adicional,
            areas=list(areas_vistas.values()),
            agendas=resumen_agendas,
        )

    def listar_eventos_publicos(self) -> list[EventoPublico]:
        """Catálogo del portal público: solo eventos activos con al menos una agenda activa."""
        eventos = (self._a_evento_publico(s) for s in self.repo.list())
        return [e for e in eventos if e is not None]

    def obtener_evento_publico(self, servicio_id: int) -> EventoPublico:
        servicio = self.repo.get(servicio_id)
        evento = self._a_evento_publico(servicio) if servicio else None
        if evento is None:
            raise NotFound("Evento no encontrado o no disponible")
        return evento

    def crear(self, data: ServicioCreate, admin_id: int) -> Servicio:
        if self.repo.by_nombre(data.nombre):
            raise Conflict("Ya existe un servicio con ese nombre")
        serv = self.repo.add(Servicio(**data.model_dump()))
        auditoria_service.registrar(
            self.db, admin_id, "crear", "servicio", serv.id, datos_nuevos=snapshot(serv, CAMPOS),
        )
        self.db.commit()
        return serv

    def actualizar(self, servicio_id: int, data: ServicioUpdate, admin_id: int) -> Servicio:
        serv = self.repo.get(servicio_id)
        if not serv:
            raise NotFound("Servicio no encontrado")
        anteriores = snapshot(serv, CAMPOS)
        for k, v in data.model_dump(exclude_unset=True).items():
            setattr(serv, k, v)
        auditoria_service.registrar(
            self.db, admin_id, "editar", "servicio", serv.id,
            datos_anteriores=anteriores, datos_nuevos=snapshot(serv, CAMPOS),
        )
        self.db.commit()
        return serv

    def desactivar(self, servicio_id: int, admin_id: int) -> Servicio:
        serv = self.repo.get(servicio_id)
        if not serv:
            raise NotFound("Servicio no encontrado")
        anteriores = snapshot(serv, CAMPOS)
        serv.activo = False
        auditoria_service.registrar(
            self.db, admin_id, "desactivar", "servicio", servicio_id,
            datos_anteriores=anteriores, datos_nuevos=snapshot(serv, CAMPOS),
        )
        self.db.commit()
        return serv
