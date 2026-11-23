from sqlalchemy.orm import Session

from app.models import Agenda, Reserva
from app.repositories.agenda_repository import AgendaRepository
from app.repositories.area_repository import AreaRepository
from app.repositories.reserva_repository import ReservaRepository
from app.repositories.servicio_repository import ServicioRepository
from app.schemas.agenda import AgendaCreate, AgendaUpdate, validar_horario
from app.services import auditoria_service
from app.services.auditoria_service import snapshot
from app.services.errors import Conflict, DomainError, NotFound
from app.services.horario_service import grilla_agenda
from app.services.reserva_service import a_admin_out

CAMPOS = [
    "id", "nombre", "area_id", "servicio_id", "hora_inicio", "hora_fin",
    "almuerzo_inicio", "almuerzo_fin", "duracion_minutos", "dias_habilitados", "activo",
]
# Campos que cambian la grilla de turnos o a quién pertenece la agenda: si se tocan, hay que
# comprobar que las reservas futuras sigan siendo turnos válidos.
CAMPOS_ESTRUCTURALES = {
    "area_id", "servicio_id", "hora_inicio", "hora_fin", "almuerzo_inicio", "almuerzo_fin",
    "duracion_minutos", "dias_habilitados",
}
NO_NULOS = {"nombre", "area_id", "servicio_id", "hora_inicio", "hora_fin", "duracion_minutos",
            "dias_habilitados", "activo"}


class AgendaService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = AgendaRepository(db)
        self.areas = AreaRepository(db)
        self.servicios = ServicioRepository(db)
        self.reservas = ReservaRepository(db)

    def listar(self, area_id: int | None = None, servicio_id: int | None = None) -> list[Agenda]:
        return self.repo.listar_ordenadas(area_id=area_id, servicio_id=servicio_id)

    def listar_publicas(self, servicio_id: int | None = None) -> list[Agenda]:
        """Agendas que el portal puede ofrecer: activas, con evento y área activos."""
        return self.repo.list_reservables(servicio_id=servicio_id)

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

    def _validar_unica(self, area_id: int, servicio_id: int, excluir_id: int | None = None) -> None:
        otra = self.repo.por_area_servicio(area_id, servicio_id)
        if otra and otra.id != excluir_id:
            raise Conflict(f"Ya existe una agenda para ese evento en esa área («{otra.nombre}»).")

    def crear(self, data: AgendaCreate, admin_id: int) -> Agenda:
        self._validar_referencias(data.area_id, data.servicio_id)
        self._validar_unica(data.area_id, data.servicio_id)
        agenda = self.repo.add(Agenda(**data.model_dump()))
        auditoria_service.registrar(
            self.db, admin_id, "crear", "agenda", agenda.id, datos_nuevos=snapshot(agenda, CAMPOS),
        )
        self.db.commit()
        return agenda

    def actualizar(self, agenda_id: int, data: AgendaUpdate, admin_id: int) -> Agenda:
        agenda = self.obtener(agenda_id)
        cambios = data.model_dump(exclude_unset=True)
        nulos = sorted(k for k, v in cambios.items() if v is None and k in NO_NULOS)
        if nulos:
            raise DomainError(f"Estos campos no pueden quedar vacíos: {', '.join(nulos)}")

        nuevo = {c: cambios.get(c, getattr(agenda, c)) for c in CAMPOS if c != "id"}
        try:
            validar_horario(nuevo["hora_inicio"], nuevo["hora_fin"], nuevo["almuerzo_inicio"],
                            nuevo["almuerzo_fin"], nuevo["duracion_minutos"])
        except ValueError as exc:
            raise DomainError(str(exc))
        if "area_id" in cambios or "servicio_id" in cambios:
            self._validar_referencias(nuevo["area_id"], nuevo["servicio_id"])
            self._validar_unica(nuevo["area_id"], nuevo["servicio_id"], excluir_id=agenda.id)

        estructurales = {k for k, v in cambios.items() if k in CAMPOS_ESTRUCTURALES and v != getattr(agenda, k)}
        if estructurales:
            incompatibles = self._reservas_incompatibles(agenda, nuevo)
            if incompatibles:
                # No se toca ninguna reserva: el administrador decide (reprogramar con el
                # colaborador o cancelar con notificación) y luego vuelve a guardar el cambio.
                raise Conflict(
                    f"No se puede aplicar el cambio: {len(incompatibles)} reserva(s) futura(s) "
                    "quedarían fuera de los nuevos turnos o asignadas a otro evento/área. "
                    "Cancele o reprograme esas reservas y vuelva a intentarlo.",
                    datos={"reservas_afectadas": [a_admin_out(r) for r in incompatibles]},
                )

        anteriores = snapshot(agenda, CAMPOS)
        for k, v in cambios.items():
            setattr(agenda, k, v)
        auditoria_service.registrar(
            self.db, admin_id, "editar", "agenda", agenda.id,
            datos_anteriores=anteriores, datos_nuevos=snapshot(agenda, CAMPOS),
        )
        self.db.commit()
        return agenda

    def _reservas_incompatibles(self, agenda: Agenda, nuevo: dict) -> list[Reserva]:
        """Reservas activas futuras de la agenda que dejarían de ser un turno EXACTO de la
        nueva configuración (mismo inicio y mismo fin), que caerían en un día deshabilitado,
        o que pertenecen a un evento distinto del nuevo (reservas.servicio_id está
        desnormalizado y forma parte de la regla de una reserva por evento por día)."""
        futuras = self.reservas.activas_futuras(agenda_id=agenda.id)
        if not futuras:
            return []
        if nuevo["servicio_id"] != agenda.servicio_id or nuevo["area_id"] != agenda.area_id:
            return futuras
        dias = {int(d) for d in nuevo["dias_habilitados"].split(",") if d}
        turnos = {
            (f.hora_inicio, f.hora_fin)
            for f in grilla_agenda(nuevo["hora_inicio"], nuevo["hora_fin"], nuevo["duracion_minutos"],
                                   nuevo["almuerzo_inicio"], nuevo["almuerzo_fin"])
        }
        return [
            r for r in futuras
            if r.fecha.weekday() not in dias or (r.hora_inicio, r.hora_fin) not in turnos
        ]

    def reservas_futuras(self, agenda_id: int):
        self.obtener(agenda_id)
        return [a_admin_out(r) for r in self.reservas.activas_futuras(agenda_id=agenda_id)]

    def cambiar_estado(self, agenda_id: int, activa: bool, admin_id: int) -> tuple[Agenda, list]:
        """Desactivar una agenda impide nuevas reservas en ella; las reservas futuras que ya
        existen se CONSERVAN y se devuelven para que el administrador decida si las atiende o
        las cancela con notificación. Reactivar es inmediato."""
        agenda = self.obtener(agenda_id)
        if activa:
            self._validar_referencias(agenda.area_id, agenda.servicio_id)
        anteriores = snapshot(agenda, CAMPOS)
        agenda.activo = activa
        auditoria_service.registrar(
            self.db, admin_id, "activar" if activa else "desactivar", "agenda", agenda.id,
            datos_anteriores=anteriores, datos_nuevos=snapshot(agenda, CAMPOS),
        )
        self.db.commit()
        afectadas = [] if activa else [a_admin_out(r) for r in self.reservas.activas_futuras(agenda_id=agenda.id)]
        return agenda, afectadas
