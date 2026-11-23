"""Servicios (mostrados al público como "Eventos" de reserva por turnos).

Relación con las áreas: un evento por turnos pertenece a una o varias áreas A TRAVÉS de sus
agendas (agenda = evento + área + horario). No hay una columna de área en el servicio a
propósito: duplicaría lo que ya registra cada agenda y podría contradecirla. Por eso un
evento se crea siempre junto con su área y su primera agenda (ver `crear`).

Regla de desactivación (coherente en todos los módulos):
- Un servicio inactivo NO aparece en el catálogo, sus agendas dejan de ofrecer turnos y no
  se pueden crear reservas nuevas (ni públicas ni manuales) — validado en el backend por
  `horario_service.agenda_reservable`, no solo ocultándolo en el frontend.
- Las reservas futuras que ya existían se CONSERVAN: la desactivación responde la lista para
  que el administrador decida si se atienden o si las cancela con notificación.
- El flag `activo` de cada agenda no se toca: al reactivar el servicio, vuelven a estar
  disponibles exactamente las agendas que estaban activas antes.
"""
from sqlalchemy.orm import Session

from app.models import Agenda, Servicio
from app.repositories.agenda_repository import AgendaRepository
from app.repositories.area_repository import AreaRepository
from app.repositories.reserva_repository import ReservaRepository
from app.repositories.servicio_repository import ServicioRepository
from app.schemas.evento import AgendaResumen, EventoPublico
from app.schemas.servicio import ServicioCreate, ServicioUpdate
from app.services import auditoria_service
from app.services.auditoria_service import snapshot
from app.services.errors import Conflict, DomainError, NotFound
from app.services.horario_service import HorarioService, ResumenTurnos
from app.services.reserva_service import a_admin_out

CAMPOS = [
    "id", "nombre", "descripcion_corta", "descripcion_larga", "imagen_url",
    "duracion_minutos", "informacion_adicional", "activo",
]
CAMPOS_AGENDA = [
    "id", "nombre", "area_id", "servicio_id", "hora_inicio", "hora_fin",
    "almuerzo_inicio", "almuerzo_fin", "duracion_minutos", "dias_habilitados", "activo",
]
NO_NULOS = {"nombre", "activo"}


class ServicioService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = ServicioRepository(db)
        self.agendas = AgendaRepository(db)
        self.areas = AreaRepository(db)
        self.reservas = ReservaRepository(db)

    def listar(self, area_id: int | None = None) -> list[Servicio]:
        return self.repo.listar(area_id=area_id)

    def listar_eventos_publicos(self) -> list[EventoPublico]:
        """Catálogo del portal: eventos activos con al menos una agenda reservable (agenda y
        área activas), con su disponibilidad resumida. Consultas agrupadas: una para las
        agendas y tres para la disponibilidad de todas ellas."""
        agendas = self.agendas.list_reservables()
        horarios = HorarioService(self.db)
        resumen = horarios.resumen_disponibilidad(agendas, horarios.fechas_reservables())
        por_servicio: dict[int, list] = {}
        for agenda in agendas:
            por_servicio.setdefault(agenda.servicio_id, []).append(agenda)
        eventos = [self._a_evento_publico(ags[0].servicio, ags, resumen) for ags in por_servicio.values()]
        return sorted(eventos, key=lambda e: e.nombre.lower())

    def obtener_evento_publico(self, servicio_id: int) -> EventoPublico:
        servicio = self.repo.get(servicio_id)
        agendas = self.agendas.list_reservables(servicio_id=servicio_id) if servicio else []
        if not servicio or not servicio.activo or not agendas:
            raise NotFound("Evento no encontrado o no disponible")
        horarios = HorarioService(self.db)
        resumen = horarios.resumen_disponibilidad(agendas, horarios.fechas_reservables())
        return self._a_evento_publico(servicio, agendas, resumen)

    @staticmethod
    def _a_evento_publico(servicio: Servicio, agendas: list, resumen: dict[int, ResumenTurnos]) -> EventoPublico:
        areas: dict[int, str] = {}
        for agenda in agendas:
            areas[agenda.area_id] = agenda.area_nombre
        duraciones = [a.duracion_minutos for a in agendas]
        resumenes = [resumen.get(a.id, ResumenTurnos()) for a in agendas]
        proximos = sorted(
            (r.proxima_fecha, r.proxima_hora) for r in resumenes if r.proxima_fecha is not None
        )
        return EventoPublico(
            id=servicio.id,
            nombre=servicio.nombre,
            descripcion_corta=servicio.descripcion_corta,
            descripcion_larga=servicio.descripcion_larga,
            imagen_url=servicio.imagen_url,
            duracion_minutos=min(duraciones),
            duracion_maxima=max(duraciones),
            informacion_adicional=servicio.informacion_adicional,
            areas=list(areas.values()),
            area_ids=list(areas.keys()),
            agendas=[AgendaResumen(id=a.id, area_id=a.area_id, area_nombre=a.area_nombre) for a in agendas],
            turnos_disponibles=sum(r.disponibles for r in resumenes),
            proximo_turno_fecha=proximos[0][0] if proximos else None,
            proximo_turno_hora=proximos[0][1] if proximos else None,
        )

    def _validar_nombre(self, nombre: str, excluir_id: int | None = None) -> None:
        otro = self.repo.by_nombre(nombre)
        if otro and otro.id != excluir_id:
            raise Conflict("Ya existe un evento con ese nombre")

    def crear(self, data: ServicioCreate, admin_id: int) -> Servicio:
        """Crea el evento y su primera agenda (área + horario) en una sola transacción: si
        algo falla, no queda un evento suelto sin área."""
        self._validar_nombre(data.nombre)
        area = self.areas.get(data.agenda.area_id)
        if not area or not area.activo:
            raise DomainError("Selecciona un área activa para el evento.")

        datos = data.model_dump(exclude={"agenda"})
        # La duración visible del evento es la de su agenda (ya no se pide por separado).
        datos["duracion_minutos"] = data.agenda.duracion_minutos
        serv = self.repo.add(Servicio(**datos))

        datos_agenda = data.agenda.model_dump()
        datos_agenda["nombre"] = (datos_agenda.get("nombre") or f"{serv.nombre} - {area.nombre}")[:140]
        agenda = self.agendas.add(Agenda(servicio_id=serv.id, activo=True, **datos_agenda))

        auditoria_service.registrar(
            self.db, admin_id, "crear", "servicio", serv.id,
            datos_nuevos={**snapshot(serv, CAMPOS), "area_id": area.id},
        )
        auditoria_service.registrar(
            self.db, admin_id, "crear", "agenda", agenda.id, datos_nuevos=snapshot(agenda, CAMPOS_AGENDA),
        )
        self.db.commit()
        return serv

    def obtener(self, servicio_id: int) -> Servicio:
        serv = self.repo.get(servicio_id)
        if not serv:
            raise NotFound("Evento no encontrado")
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
