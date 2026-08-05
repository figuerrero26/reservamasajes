from sqlalchemy.orm import Session

from app.auth.security import verify_password, create_access_token
from app.repositories.administrador_repository import AdministradorRepository
from app.schemas.auth import LoginRequest, TokenResponse
from app.services.errors import DomainError


class AuthService:
    def __init__(self, db: Session):
        self.repo = AdministradorRepository(db)

    def login(self, data: LoginRequest) -> TokenResponse:
        admin = self.repo.by_usuario(data.usuario)
        if not admin or not admin.activo or not verify_password(data.password, admin.hash_password):
            raise DomainError("Credenciales inválidas", status_code=401)
        token = create_access_token(subject=admin.usuario, rol=admin.rol)
        return TokenResponse(access_token=token, rol=admin.rol, nombre=admin.nombre)
