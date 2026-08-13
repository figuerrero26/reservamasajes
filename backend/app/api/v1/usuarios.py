from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.database.session import get_db
from app.schemas.usuario import UsuarioOut, UsuarioPasswordSet
from app.services.reserva_service import ReservaService
from app.services.usuario_service import UsuarioService

router = APIRouter(prefix="/usuarios", tags=["usuarios"])


@router.get("", response_model=list[UsuarioOut])
def buscar(nombre: str | None = None, correo: str | None = None,
           db: Session = Depends(get_db), _: dict = Depends(get_current_admin)):
    return UsuarioService(db).buscar(nombre=nombre, correo=correo)


@router.post("/{usuario_id}/desactivar", response_model=UsuarioOut)
def bloquear(usuario_id: int, db: Session = Depends(get_db),
             admin: dict = Depends(get_current_admin)):
    """Bloquea la cuenta: no podrá iniciar sesión ni crear reservas nuevas."""
    usuario, _reservas_activas = UsuarioService(db).desactivar(usuario_id, admin["id"])
    return usuario


@router.post("/{usuario_id}/activar", response_model=UsuarioOut)
def desbloquear(usuario_id: int, db: Session = Depends(get_db),
                admin: dict = Depends(get_current_admin)):
    return UsuarioService(db).activar(usuario_id, admin["id"])


@router.post("/{usuario_id}/resetear-password", response_model=UsuarioOut)
def resetear_password(usuario_id: int, data: UsuarioPasswordSet, db: Session = Depends(get_db),
                       admin: dict = Depends(get_current_admin)):
    return UsuarioService(db).resetear_password(usuario_id, data.password_nueva, admin["id"])


@router.post("/{usuario_id}/reservas-multiples", status_code=204)
def reservas_multiples(usuario_id: int, permitir: bool, db: Session = Depends(get_db),
                        admin: dict = Depends(get_current_admin)):
    ReservaService(db).habilitar_reserva_extra(usuario_id, admin["id"], permitir)
