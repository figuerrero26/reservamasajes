from datetime import date, time

from pydantic import BaseModel, ConfigDict, Field


class CedulaRequest(BaseModel):
    cedula: str = Field(min_length=3, max_length=20)


class CedulaResponse(BaseModel):
    valido: bool
    tiene_reserva_activa: bool = False


class Slot(BaseModel):
    hora_inicio: time
    hora_fin: time
    disponible: bool


class HorariosResponse(BaseModel):
    fecha: date
    agenda_id: int
    slots: list[Slot]


class ReservaCreate(BaseModel):
    cedula: str = Field(min_length=3, max_length=20)
    agenda_id: int
    fecha: date
    hora_inicio: time


class ReservaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    agenda_id: int
    usuario_id: int
    fecha: date
    hora_inicio: time
    hora_fin: time
    estado: str
