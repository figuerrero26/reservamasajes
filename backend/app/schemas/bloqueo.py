from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.reserva import ReservaAdminOut


class BloqueoCreate(BaseModel):
    agenda_id: int | None = None
    tipo: Literal["dia", "rango"]
    fecha: date
    hora_inicio: time | None = None
    hora_fin: time | None = None
    motivo: str | None = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def validar(self):
        if self.tipo == "rango":
            if not self.hora_inicio or not self.hora_fin:
                raise ValueError("Un bloqueo de tipo 'rango' requiere hora_inicio y hora_fin")
            if self.hora_fin <= self.hora_inicio:
                raise ValueError("hora_fin debe ser posterior a hora_inicio")
        else:
            # Un bloqueo de día completo no usa horas: se descartan si llegan.
            self.hora_inicio = None
            self.hora_fin = None
        return self


class BloqueoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    agenda_id: int | None = None
    tipo: str
    fecha: date
    hora_inicio: time | None = None
    hora_fin: time | None = None
    motivo: str | None = None
    creado_por: int | None = None
    created_at: datetime


class BloqueoCreadoOut(BloqueoOut):
    """Reservas futuras que ya existían dentro del periodo bloqueado. NO se cancelan solas:
    el administrador decide (POST /reservas/cancelar-lote) con confirmación."""
    reservas_afectadas: list[ReservaAdminOut] = []
