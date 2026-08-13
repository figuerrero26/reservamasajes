"""Registro de auditoría. No se elimina desde la interfaz normal."""
from datetime import date, time, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models import Auditoria


def _json_safe(value: Any) -> Any:
    if isinstance(value, (date, time, datetime)):
        return value.isoformat()
    return value


def snapshot(obj: Any, campos: list[str]) -> dict:
    """Serializa un subconjunto de campos de un modelo para dejar rastro en auditoría."""
    return {c: _json_safe(getattr(obj, c, None)) for c in campos}


def registrar(
    db: Session,
    admin_id: int | None,
    accion: str,
    entidad: str | None = None,
    entidad_id: int | None = None,
    datos_anteriores: dict | None = None,
    datos_nuevos: dict | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
) -> None:
    db.add(Auditoria(
        admin_id=admin_id,
        accion=accion,
        entidad=entidad,
        entidad_id=entidad_id,
        datos_anteriores=datos_anteriores,
        datos_nuevos=datos_nuevos,
        ip=ip,
        user_agent=user_agent,
    ))
    db.flush()
