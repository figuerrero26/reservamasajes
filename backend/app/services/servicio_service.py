"""Servicios (mostrados al público como "Eventos").

Regla de desactivación (coherente en todos los módulos):
- Un servicio inactivo NO aparece en el catálogo, sus agendas dejan de ofrecer turnos y no
  se pueden crear reservas nuevas (ni públicas ni manuales) — validado en el backend por
  `horario_service.agenda_reservable`, no solo ocultándolo en el frontend.
- Las reservas futuras que ya existían se CONSERVAN: la desactivación responde la lista para
  que el administrador decida si se atienden o si las cancela con notificación
  (POST /reservas/cancelar-lote).
- El flag `activo` de cada agenda no se toca: al reactivar el servicio, vuelven a estar
  disponibles exactamente las agendas que estaban activas antes.
"""
from sqlalchemy.orm import Session

from app.models import Servicio
from app.repositories.agenda_repository import AgendaRepository
from app.repositories.reserva_repository import ReservaRepository
from app.repositories.servicio_repository import ServicioRepository
from app.schemas.evento import AgendaResumen, EventoPublico
from app.schemas.servicio import ServicioCreate, ServicioUpdate
from app.services import auditoria_service
from app.services.auditoria_service import snapshot
from app.services.errors import Conflict, DomainError, NotFound
from app.services.reserva_service import a_admin_out

CAMPOS = [
    "id", "nombre", "descripcion_corta", "descripcion_larga", "imagen_url",
    "duracion_minutos", "informacion_adicional", "activo",
]
NO_NULOS = {"nombre", "duracion_minutos", "activo"}


class ServicioService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = ServicioRepository(db)
        self.agendas = AgendaRepository(db)
        self.reservas = ReservaRepository(db)

    def listar(self) -> list[Servicio]:
        return self.repo.list()

    def listar_eventos_publicos(self) -> list[EventoPublico]:
        """Catálogo del portal: eventos activos con al menos una agenda reservable (agenda y
        área activas). Una sola consulta para todas las agendas."""
        por_servicio: dict[int, list] = {}
        for agenda in self.agendas.list_reservables():
            por_servicio.setdefault(agenda.servicio_id, []).append(agenda)
        eventos = []
        for servicio_id, agendas in por_servicio.items():
            eventos.append(self._a_evento_publico(agendas[0].servicio, agendas))
        return sorted(eventos, key=lambda e: e.nombre.lower())

    def obtener_evento_publico(self, servicio_id: int) -> EventoPublico:
        servicio = self.repo.get(servicio_id)
        agendas = self.agendas.list_reservables(servicio_id=servicio_id) if servicio else []
        if not servicio or not servicio.activo or not agendas:
            raise NotFound("Evento no encontrado o no disponible")
        return self._a_evento_publico(servicio, agendas)

    @staticmethod
    def _a_evento_publico(servicio: Servicio, agendas: list) -> EventoPublico:
        areas: dict[int, str] = {}
        for agenda in agendas:
            areas[agenda.area_id] = agenda.area_nombre
        return EventoPublico(
            id=servicio.id,
            nombre=servicio.nombre,
            descripcion_corta=servicio.descripcion_corta,
            descripcion_larga=servicio.descripcion_larga,
            imagen_url=servicio.imagen_url,
            duracion_minutos=servicio.duracion_minutos,
            informacion_adicional=servicio.informacion_adicional,
            areas=list(areas.values()),
            agendas=[AgendaResumen(id=a.id, area_id=a.area_id, area_nombre=a.area_nombre) for a in agendas],
        )

    def _validar_nombre(self, nombre: str, excluir_id: int | None = None) -> None:
        otro = self.repo.by_nombre(nombre)
        if otro and otro.id != excluir_id:
            raise Conflict("Ya existe un servicio con ese nombre")

    def crear(self, data: ServicioCreate, admin_id: int) -> Servicio:
        self._validar_nombre(data.nombre)
        serv = self.repo.add(Servicio(**data.model_dump()))
        auditoria_service.registrar(
            self.db, admin_id, "crear", "servicio", serv.id, datos_nuevos=snapshot(serv, CAMPOS),
        )
        self.db.commit()
        return serv

    def obtener(self, servicio_id: int) -> Servicio:
        serv = self.repo.get(servicio_id)
        if not serv:
            raise NotFound("Servicio no encontrado")
        return serv

    def actualizar(self, servicio_id: int, data: ServicioUpdate, admin_id: int) -> Servicio:
        serv = self.obtener(servicio_id)
        cambios = data.model_dump(exclude_unset=True)
        nulos = sorted(k for k, v in cambios.items() if v is None and k in NO_NULOS)
        if nulos:
            raise DomainError(f"Estos campos no pueden quedar vacíos: {', '.join(nulos)}")
        if "nombre" in cambios:
            self._validar_nombre(cambios["nombre"], excluir_id=serv.id)
        anteriores = snapshot(serv, CAMPOS)
        for k, v in cambios.items():
            setattr(serv, k, v)
        auditoria_service.registrar(
            self.db, admin_id, "editar", "servicio", serv.id,
            datos_anteriores=anteriores, datos_nuevos=snapshot(serv, CAMPOS),
        )
        self.db.commit()
        return serv

    def cambiar_estado(self, servicio_id: int, activo: bool, admin_id: int) -> tuple[Servicio, list]:
        serv = self.obtener(servicio_id)
        anteriores = snapshot(serv, CAMPOS)
        serv.activo = activo
        auditoria_service.registrar(
            self.db, admin_id, "activar" if activo else "desactivar", "servicio", servicio_id,
            datos_anteriores=anteriores, datos_nuevos=snapshot(serv, CAMPOS),
        )
        self.db.commit()
        afectadas = [] if activo else [a_admin_out(r) for r in self.reservas.activas_futuras(servicio_id=servicio_id)]
        return serv, afectadas
