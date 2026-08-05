from sqlalchemy.orm import Session

from app.models import Auditoria


def registrar(db: Session, actor: str, accion: str, entidad: str | None = None,
              entidad_id: int | None = None, detalle: str | None = None) -> None:
    """Registra una acción en la bitácora de auditoría (RF-20)."""
    db.add(Auditoria(actor=actor, accion=accion, entidad=entidad,
                     entidad_id=entidad_id, detalle=detalle))
    db.flush()
