"""Áreas: organizan los eventos. Un evento por turnos pertenece a un área a través de sus
agendas y una actividad, por su columna `area_id` (obligatoria al crear).

Misma regla de desactivación que los servicios (ver servicio_service): un área inactiva deja
de ofrecer turnos en todas sus agendas y retira sus actividades del portal; las reservas e
inscripciones existentes se conservan y se informan, y al reactivarla vuelve todo lo que
estaba activo."""
from sqlalchemy.orm import Session

from app.models import Area
from app.repositories.actividad_repository import ActividadRepository
from app.repositories.area_repository import AreaRepository
from app.repositories.reserva_repository import ReservaRepository
from app.schemas.area import AreaCreate, AreaUpdate
from app.services import auditoria_service
from app.services.auditoria_service import snapshot
from app.services.errors import Conflict, DomainError, NotFound
from app.services.reserva_service import a_admin_out

CAMPOS = ["id", "nombre", "descripcion", "activo"]
NO_NULOS = {"nombre", "activo"}


class AreaService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = AreaRepository(db)
        self.reservas = ReservaRepository(db)
        self.actividades = ActividadRepository(db)

    def listar(self) -> list[Area]:
        return self.repo.list()

    def _validar_nombre(self, nombre: str, excluir_id: int | None = None) -> None:
        otra = self.repo.by_nombre(nombre)
        if otra and otra.id != excluir_id:
            raise Conflict("Ya existe un área con ese nombre")

    def obtener(self, area_id: int) -> Area:
        area = self.repo.get(area_id)
        if not area:
            raise NotFound("Área no encontrada")
        return area

    def crear(self, data: AreaCreate, admin_id: int) -> Area:
        self._validar_nombre(data.nombre)
        area = self.repo.add(Area(**data.model_dump()))
        auditoria_service.registrar(
            self.db, admin_id, "crear", "area", area.id, datos_nuevos=snapshot(area, CAMPOS),
        )
        self.db.commit()
        return area

    def actualizar(self, area_id: int, data: AreaUpdate, admin_id: int) -> Area:
        area = self.obtener(area_id)
        cambios = data.model_dump(exclude_unset=True)
        nulos = sorted(k for k, v in cambios.items() if v is None and k in NO_NULOS)
        if nulos:
            raise DomainError(f"Estos campos no pueden quedar vacíos: {', '.join(nulos)}")
        if "nombre" in cambios:
            self._validar_nombre(cambios["nombre"], excluir_id=area.id)
        anteriores = snapshot(area, CAMPOS)
        for k, v in cambios.items():
            setattr(area, k, v)
        auditoria_service.registrar(
            self.db, admin_id, "editar", "area", area.id,
            datos_anteriores=anteriores, datos_nuevos=snapshot(area, CAMPOS),
        )
        self.db.commit()
        return area

    def cambiar_estado(self, area_id: int, activo: bool, admin_id: int) -> tuple[Area, list, int]:
        """Baja lógica: un área con agendas o actividades asociadas conserva su historial (no
        se borra). Desactivarla retira del portal sus agendas y sus actividades; devuelve las
        reservas futuras afectadas y cuántas actividades activas quedan ocultas."""
        area = self.obtener(area_id)
        anteriores = snapshot(area, CAMPOS)
        area.activo = activo
        auditoria_service.registrar(
            self.db, admin_id, "activar" if activo else "desactivar", "area", area_id,
            datos_anteriores=anteriores, datos_nuevos=snapshot(area, CAMPOS),
        )
        self.db.commit()
        if activo:
            return area, [], 0
        afectadas = [a_admin_out(r) for r in self.reservas.activas_futuras(area_id=area_id)]
        return area, afectadas, self.actividades.contar_activas_por_area(area_id)
