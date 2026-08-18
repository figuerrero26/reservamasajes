from sqlalchemy.orm import Session

from app.auth.security import hash_password
from app.models import Administrador, Rol
from app.repositories.administrador_repository import AdministradorRepository
from app.schemas.administrador import AdministradorCreate, AdministradorOut
from app.services import auditoria_service
from app.services.errors import Conflict, NotFound


def _a_schema(admin: Administrador) -> AdministradorOut:
    return AdministradorOut(
        id=admin.id, usuario=admin.usuario, nombre=admin.nombre,
        rol=admin.rol.nombre, activo=admin.activo, created_at=admin.created_at,
    )


class AdministradorService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = AdministradorRepository(db)

    def listar(self) -> list[AdministradorOut]:
        return [_a_schema(a) for a in self.repo.list()]

    def crear(self, data: AdministradorCreate, actor_admin_id: int) -> AdministradorOut:
        if self.repo.by_usuario(data.usuario):
            raise Conflict("Ya existe un administrador con ese usuario")
        rol = self.db.query(Rol).filter_by(nombre=data.rol).one()
        admin = self.repo.add(Administrador(
            usuario=data.usuario, nombre=data.nombre,
            hash_password=hash_password(data.password), rol_id=rol.id,
        ))
        auditoria_service.registrar(
            self.db, actor_admin_id, "crear_administrador", "administrador", admin.id,
            datos_nuevos={"usuario": admin.usuario, "nombre": admin.nombre, "rol": data.rol},
        )
        self.db.commit()
        return _a_schema(admin)

    def desactivar(self, admin_id: int, actor_admin_id: int) -> AdministradorOut:
        admin = self.repo.get(admin_id)
        if not admin:
            raise NotFound("Administrador no encontrado")
        if admin.id == actor_admin_id:
            raise Conflict("No puede bloquear su propia cuenta")
        admin.activo = False
        auditoria_service.registrar(self.db, actor_admin_id, "bloquear_administrador", "administrador", admin_id)
        self.db.commit()
        return _a_schema(admin)

    def activar(self, admin_id: int, actor_admin_id: int) -> AdministradorOut:
        admin = self.repo.get(admin_id)
        if not admin:
            raise NotFound("Administrador no encontrado")
        admin.activo = True
        auditoria_service.registrar(self.db, actor_admin_id, "desbloquear_administrador", "administrador", admin_id)
        self.db.commit()
        return _a_schema(admin)

    def eliminar(self, admin_id: int, actor_admin_id: int) -> None:
        """Elimina la cuenta de verdad (a diferencia de bloquear). Lo que ese admin haya
        creado (bloqueos, configuración SMTP) o su rastro en la auditoría sobrevive, solo
        pierde el enlace a quién lo hizo (ON DELETE SET NULL, ver migración 0008)."""
        admin = self.repo.get(admin_id)
        if not admin:
            raise NotFound("Administrador no encontrado")
        if admin.id == actor_admin_id:
            raise Conflict("No puede eliminar su propia cuenta")
        auditoria_service.registrar(
            self.db, actor_admin_id, "eliminar_administrador", "administrador", admin_id,
            datos_anteriores={"usuario": admin.usuario, "nombre": admin.nombre, "rol": admin.rol.nombre},
        )
        self.repo.delete(admin)
        self.db.commit()
