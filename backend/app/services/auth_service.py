from sqlalchemy.orm import Session

from app.auth.politica_password import problemas_password
from app.auth.security import create_access_token, hash_password, huella_password, verify_password
from app.models import Administrador
from app.repositories.administrador_repository import AdministradorRepository
from app.schemas.auth import CambiarPasswordRequest, LoginRequest, ResetPasswordRequest, TokenResponse
from app.services import auditoria_service
from app.services.errors import Conflict, DomainError, NotFound
from app.utils.time import now

PROPIA_CON_ACTUAL = (
    "Para cambiar tu propia contraseña usa «Cambiar mi contraseña»: te pedirá la contraseña actual."
)


def token_admin(admin: Administrador) -> TokenResponse:
    """Sesión del panel. Lleva la huella de la contraseña vigente: al cambiarla o
    restablecerla, las sesiones abiertas con la anterior dejan de servir (ver
    app/api/deps.py:get_current_admin)."""
    token = create_access_token(
        subject=admin.usuario, scope="admin", entity_id=admin.id, rol=admin.rol.nombre,
        pwd=huella_password(admin.hash_password),
    )
    return TokenResponse(access_token=token, rol=admin.rol.nombre, nombre=admin.nombre)


def asignar_password(admin: Administrador, nueva: str) -> None:
    """Valida la fortaleza (con el usuario y el nombre de la cuenta), impide repetir la
    contraseña vigente y guarda SOLO el hash Bcrypt."""
    problemas = problemas_password(nueva, admin.usuario, admin.nombre)
    if problemas:
        raise DomainError("La contraseña no es segura: " + " ".join(problemas), status_code=422)
    if verify_password(nueva, admin.hash_password):
        raise DomainError("La nueva contraseña debe ser distinta de la actual.", status_code=422)
    admin.hash_password = hash_password(nueva)
    admin.password_actualizada_en = now().replace(tzinfo=None)  # DATETIME en hora local


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

        auditoria_service.registrar(
            self.db, admin.id, "login", "administrador", admin.id, ip=ip, user_agent=user_agent,
        )
        self.db.commit()
        return token_admin(admin)

    def cambiar_password(self, admin_id: int, data: CambiarPasswordRequest,
                          ip: str | None = None, user_agent: str | None = None) -> TokenResponse:
        """Cambio de la contraseña propia (exige la actual). Devuelve una sesión nueva: la
        actual sigue abierta y las demás sesiones de la cuenta se cierran."""
        admin = self.repo.get(admin_id)
        if not admin:
            raise NotFound("Administrador no encontrado")
        if not verify_password(data.password_actual, admin.hash_password):
            auditoria_service.registrar(
                self.db, admin_id, "cambiar_password_fallido", "administrador", admin_id,
                datos_nuevos={"motivo": "contraseña actual incorrecta"}, ip=ip, user_agent=user_agent,
            )
            self.db.commit()
            raise DomainError("La contraseña actual no es correcta", status_code=401)
        asignar_password(admin, data.password_nueva)
        auditoria_service.registrar(
            self.db, admin_id, "cambiar_password", "administrador", admin_id,
            datos_nuevos={"usuario": admin.usuario, "otras_sesiones_cerradas": True},
            ip=ip, user_agent=user_agent,
        )
        self.db.commit()
        return token_admin(admin)

    def restablecer_password(self, actor_admin_id: int, admin: Administrador, nueva: str,
                             ip: str | None = None, user_agent: str | None = None) -> Administrador:
        """Un administrador (rol con acceso total) fija la contraseña de OTRA cuenta
        administrativa. Las sesiones abiertas de esa cuenta se cierran. La propia nunca se
        restablece por esta vía: se cambia con la contraseña actual."""
        if admin.id == actor_admin_id:
            raise Conflict(PROPIA_CON_ACTUAL)
        asignar_password(admin, nueva)
        auditoria_service.registrar(
            self.db, actor_admin_id, "restablecer_password_administrador", "administrador", admin.id,
            datos_nuevos={"usuario": admin.usuario, "sesiones_cerradas": True},
            ip=ip, user_agent=user_agent,
        )
        self.db.commit()
        return admin

    def resetear_password(self, actor_admin_id: int, data: ResetPasswordRequest,
                           ip: str | None = None, user_agent: str | None = None) -> None:
        """Variante por nombre de usuario (endpoint histórico POST /auth/resetear-password):
        mismas reglas que el restablecimiento desde el panel."""
        admin = self.repo.by_usuario(data.usuario)
        if not admin:
            raise NotFound("Administrador no encontrado")
        self.restablecer_password(actor_admin_id, admin, data.password_nueva, ip=ip, user_agent=user_agent)
