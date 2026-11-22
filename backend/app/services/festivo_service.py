"""Festivos: mismo criterio que los bloqueos (ver bloqueo_service). Un festivo activo impide
nuevas reservas ese día en todas las agendas, pero NO cancela las existentes: se informan
para que el administrador decida."""
from sqlalchemy.orm import Session

from app.models import Festivo
from app.repositories.festivo_repository import FestivoRepository
from app.repositories.reserva_repository import ReservaRepository
from app.schemas.festivo import FestivoCreate, FestivoUpdate
from app.schemas.reserva import ReservaAdminOut
from app.services import auditoria_service
from app.services.errors import Conflict, DomainError, NotFound
from app.services.reserva_service import a_admin_out

CAMPOS = ["id", "fecha", "nombre", "descripcion", "estado"]


class FestivoService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = FestivoRepository(db)
        self.reservas = ReservaRepository(db)

    def listar(self) -> list[Festivo]:
        return self.repo.listar()

    def reservas_afectadas(self, festivo: Festivo) -> list[ReservaAdminOut]:
        if not festivo.estado:
            return []
        return [a_admin_out(r) for r in self.reservas.activas_futuras(fecha=festivo.fecha)]

    def afectadas_por_id(self, festivo_id: int) -> list[ReservaAdminOut]:
        return self.reservas_afectadas(self._obtener(festivo_id))

    def _obtener(self, festivo_id: int) -> Festivo:
        festivo = self.repo.get(festivo_id)
        if not festivo:
            raise NotFound("Festivo no encontrado")
        return festivo

    def crear(self, data: FestivoCreate, admin_id: int) -> tuple[Festivo, list[ReservaAdminOut]]:
        if self.repo.by_fecha(data.fecha):
            raise Conflict("Ya existe un festivo registrado para esa fecha")
        festivo = self.repo.add(Festivo(**data.model_dump()))
        afectadas = self.reservas_afectadas(festivo)
        auditoria_service.registrar(
            self.db, admin_id, "crear", "festivo", festivo.id,
            datos_nuevos={**auditoria_service.snapshot(festivo, CAMPOS), "reservas_afectadas": len(afectadas)},
        )
        self.db.commit()
        return festivo, afectadas

    def actualizar(self, festivo_id: int, data: FestivoUpdate, admin_id: int) -> tuple[Festivo, list[ReservaAdminOut]]:
        festivo = self._obtener(festivo_id)
        cambios = data.model_dump(exclude_unset=True)
        if any(v is None for k, v in cambios.items() if k in ("nombre", "estado")):
            raise DomainError("El nombre y el estado del festivo no pueden quedar vacíos")
        anteriores = auditoria_service.snapshot(festivo, CAMPOS)
        for k, v in cambios.items():
            setattr(festivo, k, v)
        auditoria_service.registrar(
            self.db, admin_id, "editar", "festivo", festivo.id,
            datos_anteriores=anteriores, datos_nuevos=auditoria_service.snapshot(festivo, CAMPOS),
        )
        self.db.commit()
        return festivo, self.reservas_afectadas(festivo)

    def eliminar(self, festivo_id: int, admin_id: int) -> None:
        festivo = self._obtener(festivo_id)
        anteriores = auditoria_service.snapshot(festivo, CAMPOS)
        self.repo.delete(festivo)
        auditoria_service.registrar(
            self.db, admin_id, "eliminar", "festivo", festivo_id, datos_anteriores=anteriores,
        )
        self.db.commit()
