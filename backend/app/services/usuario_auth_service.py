from sqlalchemy.orm import Session

from app.auth.security import create_access_token, hash_password, verify_password
from app.models import Usuario
from app.repositories.usuario_repository import UsuarioRepository
from app.schemas.cuenta import LoginUsuarioRequest, PerfilUsuarioOut, RegistroRequest, TokenUsuarioResponse
from app.services import auditoria_service
from app.services.errors import Conflict, DomainError, NotFound


class UsuarioAuthService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = UsuarioRepository(db)

    def _token(self, usuario: Usuario) -> TokenUsuarioResponse:
        token = create_access_token(subject=usuario.correo, scope="usuario", entity_id=usuario.id)
        return TokenUsuarioResponse(
            access_token=token, nombre=usuario.nombre, apellido=usuario.apellido,
            correo=usuario.correo,
        )

    def registrar(self, data: RegistroRequest, ip: str | None = None,
                  user_agent: str | None = None) -> TokenUsuarioResponse:
        """Registro público abierto: solo nombre, apellido, correo y contraseña. No exige
        (ni acepta) cédula — cualquier persona puede crear una cuenta."""
        if self.repo.by_correo(data.correo):
            raise Conflict("Ese correo electrónico ya está en uso.")

        usuario = Usuario(
            nombre=data.nombre, apellido=data.apellido, correo=data.correo,
            password_hash=hash_password(data.password), activo=True,
        )
        self.repo.add(usuario)
        auditoria_service.registrar(
            self.db, None, "registro_usuario", "usuario", usuario.id,
            datos_nuevos={"correo": usuario.correo}, ip=ip, user_agent=user_agent,
        )
        self.db.commit()
        self.db.refresh(usuario)
        return self._token(usuario)

    def login(self, data: LoginUsuarioRequest, ip: str | None = None,
              user_agent: str | None = None) -> TokenUsuarioResponse:
        usuario = self.repo.by_correo(data.correo)
        if (not usuario or not usuario.activo or not usuario.tiene_cuenta
                or not verify_password(data.password, usuario.password_hash)):
            auditoria_service.registrar(
                self.db, None, "login_usuario_fallido", "usuario", None,
                datos_nuevos={"correo": data.correo}, ip=ip, user_agent=user_agent,
            )
            self.db.commit()
            raise DomainError("Credenciales inválidas", status_code=401)

        auditoria_service.registrar(
            self.db, None, "login_usuario", "usuario", usuario.id, ip=ip, user_agent=user_agent,
        )
        self.db.commit()
        return self._token(usuario)

    def perfil(self, usuario_id: int) -> PerfilUsuarioOut:
        usuario = self.repo.get(usuario_id)
        if not usuario:
            raise NotFound("Usuario no encontrado")
        return PerfilUsuarioOut(
            id=usuario.id, nombre=usuario.nombre,
            apellido=usuario.apellido, correo=usuario.correo,
            permite_reservas_multiples=usuario.permite_reservas_multiples,
        )
