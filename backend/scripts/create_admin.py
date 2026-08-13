"""Crea el rol y el administrador inicial (idempotente) y siembra datos de ejemplo mínimos.

Uso: python -m scripts.create_admin
Las credenciales se toman de las variables de entorno ADMIN_USER / ADMIN_INITIAL_PASSWORD.
"""
from datetime import time

from app.auth.security import hash_password
from app.config import settings
from app.database.session import SessionLocal
from app.models import Administrador, Agenda, Area, Rol, Servicio


def run() -> None:
    db = SessionLocal()
    try:
        rol_admin = db.query(Rol).filter_by(nombre="administrador").one_or_none()
        if rol_admin is None:
            rol_admin = Rol(nombre="administrador", descripcion="Acceso total al panel administrativo")
            db.add(rol_admin)
            db.flush()
            print("[seed] Rol 'administrador' creado.")

        admin = db.query(Administrador).filter_by(usuario=settings.ADMIN_USER).one_or_none()
        if admin is None:
            db.add(Administrador(
                usuario=settings.ADMIN_USER,
                nombre=settings.ADMIN_NOMBRE,
                hash_password=hash_password(settings.ADMIN_INITIAL_PASSWORD),
                rol_id=rol_admin.id,
            ))
            print(f"[seed] Administrador '{settings.ADMIN_USER}' creado.")
        else:
            print(f"[seed] Administrador '{settings.ADMIN_USER}' ya existe.")

        # Datos de ejemplo mínimos (solo si no hay áreas todavía). Nada de esto está
        # codificado en la lógica de negocio: son únicamente filas de datos de ejemplo,
        # editables/eliminables desde el panel sin tocar el código.
        if db.query(Area).count() == 0:
            oficinas = Area(nombre="Oficinas")
            planta = Area(nombre="Planta")
            masajes = Servicio(
                nombre="Masaje de relajación",
                descripcion_corta="Sesión individual de bienestar y relajación para colaboradores",
                descripcion_larga="Sesión de bienestar guiada por un terapeuta certificado, enfocada "
                                  "en aliviar tensión muscular y estrés laboral.",
                duracion_minutos=30,
            )
            silla = Servicio(
                nombre="Silla de masajes",
                descripcion_corta="Sesión rápida de masaje en silla ergonómica",
                descripcion_larga="Sesión corta pensada para pausas activas durante la jornada laboral.",
                duracion_minutos=15,
            )
            db.add_all([oficinas, planta, masajes, silla])
            db.flush()
            db.add(Agenda(
                nombre="Masajes - Oficinas",
                area_id=oficinas.id, servicio_id=masajes.id,
                hora_inicio=time(8, 0), hora_fin=time(17, 0),
                almuerzo_inicio=time(12, 0), almuerzo_fin=time(13, 0),
                duracion_minutos=masajes.duracion_minutos,
                dias_habilitados="0,1,2,3,4", activo=True,
            ))
            print("[seed] Datos de ejemplo creados (áreas, eventos, agenda).")

        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    run()
