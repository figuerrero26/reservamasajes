from datetime import datetime

from sqlalchemy.orm import Session

from app.auth.security import hash_password
from app.models import EstadoReserva, Usuario
from app.repositories.reserva_repository import ReservaRepository
from app.repositories.usuario_repository import UsuarioRepository
from app.services import auditoria_service
from app.services.errors import NotFound
from app.utils.time import TZ, now


class UsuarioService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = UsuarioRepository(db)
        self.reservas = ReservaRepository(db)

    def buscar(self, nombre: str | None = None, correo: str | None = None) -> list[Usuario]:
        return self.repo.buscar(nombre=nombre, correo=correo)

    def desactivar(self, usuario_id: int, admin_id: int) -> tuple[Usuario, int]:
        """Bloquea la cuenta (baja lógica). Si el colaborador tiene reservas activas, se
        informan pero no se cancelan: un usuario bloqueado no puede iniciar sesión ni crear
        reservas nuevas, pero su historial se conserva intacto.

        Devuelve el usuario y la cantidad de reservas activas que quedaron pendientes de revisión.
        """
        usuario = self.repo.get(usuario_id)
        if not usuario:
            raise NotFound("Colaborador no encontrado")
        activas = self.reservas.activas_por_usuario(usuario_id)
        usuario.activo = False
        auditoria_service.registrar(
            self.db, admin_id, "bloquear_usuario", "usuario", usuario_id,
            datos_nuevos={"reservas_activas_al_bloquear": len(activas)},
        )
        self.db.commit()
        return usuario, len(activas)

    def activar(self, usuario_id: int, admin_id: int) -> Usuario:
        usuario = self.repo.get(usuario_id)
        if not usuario:
            raise NotFound("Colaborador no encontrado")
        usuario.activo = True
        auditoria_service.registrar(self.db, admin_id, "desbloquear_usuario", "usuario", usuario_id)
        self.db.commit()
        return usuario

    def eliminar(self, usuario_id: int, admin_id: int) -> int:
        """Elimina la cuenta de verdad (no un bloqueo lógico). Las reservas que ya pasaron
        se dejan intactas —ya tienen la identidad fotografiada, ver Reserva.usuario_nombre—;
        las activas que todavía no han ocurrido se cancelan primero, porque no tendría
        sentido dejar "agendado" algo de una persona que ya no tiene cuenta.
        """
        usuario = self.repo.get(usuario_id)
        if not usuario:
            raise NotFound("Colaborador no encontrado")

        momento = now()
        futuras = [
            r for r in self.reservas.activas_por_usuario(usuario_id)
            if datetime.combine(r.fecha, r.hora_inicio, tzinfo=TZ) > momento
        ]
        for r in futuras:
            r.estado = EstadoReserva.CANCELADA.value
            r.cancelled_at = momento
            r.cancelled_by = "usuario_eliminado"

        auditoria_service.registrar(
            self.db, admin_id, "eliminar_usuario", "usuario", usuario_id,
            datos_anteriores={"nombre": usuario.nombre, "apellido": usuario.apellido, "correo": usuario.correo},
            datos_nuevos={"reservas_futuras_canceladas": len(futuras)},
        )
        self.db.delete(usuario)
        self.db.commit()
        return len(futuras)

    def resetear_password(self, usuario_id: int, password_nueva: str, admin_id: int) -> Usuario:
        """Restablece la contraseña de un colaborador (p. ej. si perdió acceso a su correo)."""
        usuario = self.repo.get(usuario_id)
        if not usuario:
            raise NotFound("Colaborador no encontrado")
        usuario.password_hash = hash_password(password_nueva)
        auditoria_service.registrar(
            self.db, admin_id, "resetear_password_usuario", "usuario", usuario_id,
        )
        self.db.commit()
        return usuario
