"""Crea el administrador inicial (idempotente) y siembra datos de ejemplo mínimos.

Uso: python -m scripts.create_admin
Las credenciales se toman de las variables de entorno ADMIN_USER / ADMIN_PASSWORD.
"""
from datetime import time

from app.auth.security import hash_password
from app.config import settings
from app.database.session import SessionLocal
from app.models import Administrador, Area, Servicio, Agenda, Usuario


def run() -> None:
    db = SessionLocal()
    try:
        admin = db.query(Administrador).filter_by(usuario=settings.ADMIN_USER).one_or_none()
        if admin is None:
            db.add(Administrador(
                usuario=settings.ADMIN_USER,
                nombre=settings.ADMIN_NOMBRE,
                hash_password=hash_password(settings.ADMIN_PASSWORD),
                rol="admin",
            ))
            print(f"[seed] Administrador '{settings.ADMIN_USER}' creado.")
        else:
            print(f"[seed] Administrador '{settings.ADMIN_USER}' ya existe.")

        # Datos de ejemplo mínimos (solo si no hay áreas todavía).
        if db.query(Area).count() == 0:
            oficinas = Area(nombre="Oficinas")
            planta = Area(nombre="Planta")
            masajes = Servicio(nombre="Masajes")
            silla = Servicio(nombre="Silla de masajes")
            db.add_all([oficinas, planta, masajes, silla])
            db.flush()
            db.add(Agenda(
                nombre="Masajes - Oficinas",
                area_id=oficinas.id, servicio_id=masajes.id,
                hora_inicio=time(8, 0), hora_fin=time(17, 0),
                almuerzo_inicio=time(12, 0), almuerzo_fin=time(13, 0),
                duracion_min=settings.DURACION_CITA_DEFAULT,
                dias_habilitados="0,1,2,3,4", estado=True,
            ))
            db.add(Usuario(cedula="123456789", nombre_completo="Colaborador Demo"))
            print("[seed] Datos de ejemplo creados (áreas, servicios, agenda, usuario demo).")

        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    run()
