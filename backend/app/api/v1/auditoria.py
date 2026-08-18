from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin_full
from app.database.session import get_db
from app.models import Auditoria
from app.schemas.auditoria import AuditoriaOut

router = APIRouter(prefix="/auditoria", tags=["auditoria"])


@router.get("", response_model=list[AuditoriaOut])
def listar(
    entidad: str | None = None, admin_id: int | None = None, limit: int = 200,
    db: Session = Depends(get_db), _: dict = Depends(get_current_admin_full),
):
    """Solo lectura: la bitácora no se puede modificar ni eliminar desde la interfaz normal."""
    stmt = select(Auditoria).order_by(Auditoria.created_at.desc()).limit(min(limit, 500))
    if entidad:
        stmt = stmt.where(Auditoria.entidad == entidad)
    if admin_id:
        stmt = stmt.where(Auditoria.admin_id == admin_id)
    return db.execute(stmt).scalars().all()
