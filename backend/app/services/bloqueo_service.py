"""Bloqueos de agenda (día completo o rango horario).

Un bloqueo NO cancela reservas: impide nuevas reservas en el periodo (la generación de
turnos lo marca como BLOQUEADO) y devuelve las reservas futuras que ya existían dentro del
periodo, para que el administrador decida, con confirmación explícita, si las cancela y
notifica (POST /reservas/cancelar-lote) o si las mantiene.
"""
from datetime import date

from sqlalchemy.orm import Session

from app.models import Bloqueo
from app.repositories.agenda_repository import AgendaRepository
from app.repositories.bloqueo_repository import BloqueoRepository
from app.repositories.reserva_repository import ReservaRepository
from app.schemas.bloqueo import BloqueoCreate
from app.schemas.reserva import ReservaAdminOut
from app.services import auditoria_service
from app.services.errors import DomainError, NotFound
from app.services.reserva_service import a_admin_out

CAMPOS = ["id", "agenda_id", "tipo", "fecha", "hora_inicio", "hora_fin", "motivo"]


class BloqueoService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = BloqueoRepository(db)
        self.agendas = AgendaRepository(db)
        self.reservas = ReservaRepository(db)

    def listar(self, fecha: date | None = None) -> list[Bloqueo]:
        return self.repo.listar(fecha)

    def reservas_afectadas(self, bloqueo: Bloqueo) -> list[ReservaAdminOut]:
        rango = (bloqueo.hora_inicio, bloqueo.hora_fin) if bloqueo.tipo == "rango" else (None, None)
        return [
            a_admin_out(r) for r in self.reservas.activas_futuras(
                agenda_id=bloqueo.agenda_id, fecha=bloqueo.fecha, hora_inicio=rango[0], hora_fin=rango[1],
            )
        ]

    def afectadas_por_id(self, bloqueo_id: int) -> list[ReservaAdminOut]:
        bloqueo = self.repo.get(bloqueo_id)
        if not bloqueo:
            raise NotFound("Bloqueo no encontrado")
        return self.reservas_afectadas(bloqueo)

    def crear(self, data: BloqueoCreate, admin_id: int) -> tuple[Bloqueo, list[ReservaAdminOut]]:
        if data.agenda_id is not None and not self.agendas.get(data.agenda_id):
            raise DomainError("La agenda seleccionada no existe")
        bloqueo = Bloqueo(**data.model_dump(), creado_por=admin_id)
        self.repo.add(bloqueo)
        afectadas = self.reservas_afectadas(bloqueo)
        auditoria_service.registrar(
            self.db, admin_id, "crear", "bloqueo", bloqueo.id,
            datos_nuevos={**auditoria_service.snapshot(bloqueo, CAMPOS), "reservas_afectadas": len(afectadas)},
        )
        self.db.commit()
        return bloqueo, afectadas

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
