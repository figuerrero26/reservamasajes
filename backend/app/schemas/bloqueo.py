from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict, Field, model_validator


class BloqueoBase(BaseModel):
    agenda_id: int | None = None
    tipo: str = Field(pattern="^(dia|rango)$")
    fecha: date
    hora_inicio: time | None = None
    hora_fin: time | None = None
    motivo: str | None = None

    @model_validator(mode="after")
    def validar(self):
        if self.tipo == "rango":
            if not self.hora_inicio or not self.hora_fin:
                raise ValueError("Un bloqueo de tipo 'rango' requiere hora_inicio y hora_fin")
            if self.hora_fin <= self.hora_inicio:
                raise ValueError("hora_fin debe ser posterior a hora_inicio")
        return self


class BloqueoCreate(BloqueoBase):
    pass


class BloqueoOut(BloqueoBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    creado_por: int | None = None
    created_at: datetime
