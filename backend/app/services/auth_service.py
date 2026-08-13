from sqlalchemy.orm import Session

from app.auth.security import verify_password, hash_password, create_access_token
from app.repositories.administrador_repository import AdministradorRepository
from app.schemas.auth import CambiarPasswordRequest, LoginRequest, ResetPasswordRequest, TokenResponse
from app.services import auditoria_service
from app.services.errors import DomainError, NotFound


class AuthService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = AdministradorRepository(db)

    def login(self, data: LoginRequest, ip: str | None = None, user_agent: str | None = None) -> TokenResponse:
        admin = self.repo.by_usuario(data.usuario)
        if not admin or not admin.activo or not verify_password(data.password, admin.hash_password):
            auditoria_service.registrar(
                self.db, None, "login_fallido", "administrador", None,
                datos_nuevos={"usuario": data.usuario}, ip=ip, user_agent=user_agent,
            )
            self.db.commit()
            raise DomainError("Credenciales inválidas", status_code=401)

        token = create_access_token(subject=admin.usuario, scope="admin", entity_id=admin.id, rol=admin.rol.nombre)
        auditoria_service.registrar(
            self.db, admin.id, "login", "administrador", admin.id, ip=ip, user_agent=user_agent,
        )
        self.db.commit()
        return TokenResponse(access_token=token, rol=admin.rol.nombre, nombre=admin.nombre)

    def cambiar_password(self, admin_id: int, data: CambiarPasswordRequest,
                          ip: str | None = None, user_agent: str | None = None) -> None:
        admin = self.repo.get(admin_id)
        if not admin:
            raise NotFound("Administrador no encontrado")
        if not verify_password(data.password_actual, admin.hash_password):
            raise DomainError("La contraseña actual no es correcta", status_code=401)
        admin.hash_password = hash_password(data.password_nueva)
        auditoria_service.registrar(
            self.db, admin_id, "cambiar_password", "administrador", admin_id,
            ip=ip, user_agent=user_agent,
        )
        self.db.commit()

    def resetear_password(self, actor_admin_id: int, data: ResetPasswordRequest,
                           ip: str | None = None, user_agent: str | None = None) -> None:
        """Restablece la contraseña de otro administrador (uso soportado a futuro multi-admin)."""
        admin = self.repo.by_usuario(data.usuario)
        if not admin:
            raise NotFound("Administrador no encontrado")
        admin.hash_password = hash_password(data.password_nueva)
        auditoria_service.registrar(
            self.db, actor_admin_id, "resetear_password", "administrador", admin.id,
            ip=ip, user_agent=user_agent,
        )
        self.db.commit()
