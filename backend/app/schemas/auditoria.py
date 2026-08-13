from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AuditoriaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    admin_id: int | None = None
    accion: str
    entidad: str | None = None
    entidad_id: int | None = None
    datos_anteriores: dict | None = None
    datos_nuevos: dict | None = None
    ip: str | None = None
    user_agent: str | None = None
    created_at: datetime
