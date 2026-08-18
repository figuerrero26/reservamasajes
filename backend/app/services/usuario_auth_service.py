import hashlib

from sqlalchemy.orm import Session

from app.auth.security import create_access_token, decode_token, hash_password, verify_password
from app.config import settings
from app.models import Usuario
from app.repositories.usuario_repository import UsuarioRepository
from app.schemas.cuenta import LoginUsuarioRequest, PerfilUsuarioOut, RegistroRequest, TokenUsuarioResponse
from app.services import auditoria_service
from app.services.errors import Conflict, DomainError, NotFound

ENLACE_INVALIDO = "El enlace no es válido o ya expiró. Solicita uno nuevo."


def _huella_password(password_hash: str) -> str:
    """Foto corta del hash de contraseña vigente al emitir el token de restablecimiento.
    Al redimir el token se compara contra la huella actual: si la contraseña ya cambió
    (porque el token se usó antes, o se cambió por otra vía), la huella no coincide y el
    token queda invalidado — sin necesidad de guardar estado del token en la base de datos."""
    return hashlib.sha256(password_hash.encode()).hexdigest()[:16]


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

    def solicitar_restablecimiento(self, correo: str) -> tuple[int, str] | None:
        """Genera el token si el correo corresponde a una cuenta real y activa. Devuelve
        None en cualquier otro caso (correo inexistente, cuenta bloqueada, sin contraseña
        todavía) — el endpoint responde igual en ambos casos para no filtrar qué correos
        están registrados."""
        usuario = self.repo.by_correo(correo)
        if not usuario or not usuario.activo or not usuario.tiene_cuenta:
            return None
        token = create_access_token(
            subject=usuario.correo, scope="reset_password", entity_id=usuario.id,
            expires_minutes=settings.RESET_PASSWORD_EXPIRE_MINUTES,
            pwd=_huella_password(usuario.password_hash),
        )
        auditoria_service.registrar(
            self.db, None, "solicitar_restablecer_password", "usuario", usuario.id,
        )
        self.db.commit()
        return usuario.id, token

    def restablecer_password(self, token: str, password_nueva: str) -> None:
        try:
            payload = decode_token(token)
        except Exception:
            raise DomainError(ENLACE_INVALIDO, status_code=400)
        if payload.get("scope") != "reset_password":
            raise DomainError(ENLACE_INVALIDO, status_code=400)

        usuario = self.repo.get(payload.get("id"))
        if not usuario or not usuario.activo or not usuario.tiene_cuenta:
            raise DomainError(ENLACE_INVALIDO, status_code=400)
        if payload.get("pwd") != _huella_password(usuario.password_hash):
            # La contraseña ya cambió desde que se emitió el token: ya se usó, o cambió por
            # otra vía (ej. el admin la reseteó). El token queda invalidado sin más chequeos.
            raise DomainError(ENLACE_INVALIDO, status_code=400)

        usuario.password_hash = hash_password(password_nueva)
        auditoria_service.registrar(
            self.db, None, "restablecer_password_propio", "usuario", usuario.id,
        )
        self.db.commit()
