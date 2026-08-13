"""Fixtures compartidos. Las pruebas corren contra una MariaDB real (no SQLite):

la regla de concurrencia y la regla "una reserva por usuario+evento+día" dependen de la
columna generada `slot_lock` y de índices únicos propios de MariaDB, así que solo tienen
sentido validadas contra el motor real.

Variables de entorno usadas: TEST_DATABASE_URL (opcional; por defecto reutiliza el host de
DATABASE_URL con la base de datos "reservas_test", que se crea si no existe) y
MARIADB_ROOT_PASSWORD (para crear esa BD y otorgarle permisos al usuario de la app — ya viene
configurada en docker-compose.yml).
"""
import os
import re

import pymysql
import pytest

DEFAULT_TEST_URL = "mysql+pymysql://reservas:reservas@db:3306/reservas_test"
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL") or re.sub(
    r"/[^/]+$", "/reservas_test", os.environ.get("DATABASE_URL", DEFAULT_TEST_URL)
)

# Debe fijarse ANTES de importar cualquier módulo de app.* (config usa lru_cache y
# database/session crea el engine al importarse).
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ.setdefault("JWT_SECRET", "test-secret")

_match = re.match(r"mysql\+pymysql://([^:]+):([^@]+)@([^:/]+):(\d+)/(.+)", TEST_DATABASE_URL)
_user, _password, _host, _port, _dbname = _match.groups()

# El usuario de la aplicación (MARIADB_USER) solo tiene privilegios sobre la BD de negocio
# (MARIADB_DATABASE): el contenedor oficial de MariaDB no le otorga CREATE DATABASE global.
# Por eso la BD de pruebas se crea y se le otorgan permisos como root; las pruebas en sí
# siguen corriendo con el usuario normal de la app (misma URL que usa la aplicación).
_root_password = os.environ.get("MARIADB_ROOT_PASSWORD", "reservas_root")
_root_conn = pymysql.connect(host=_host, port=int(_port), user="root", password=_root_password)
try:
    with _root_conn.cursor() as cur:
        cur.execute(f"CREATE DATABASE IF NOT EXISTS `{_dbname}`")
        cur.execute(f"GRANT ALL PRIVILEGES ON `{_dbname}`.* TO %s@'%%'", (_user,))
        cur.execute("FLUSH PRIVILEGES")
    _root_conn.commit()
finally:
    _root_conn.close()

from app.database.base import Base  # noqa: E402
from app.database.session import engine, SessionLocal  # noqa: E402
from app.auth.security import hash_password  # noqa: E402
from app.models import Administrador, Agenda, Area, Rol, Servicio, Usuario  # noqa: E402
from app.main import app  # noqa: E402
from app.database.session import get_db  # noqa: E402

from datetime import time  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

CORREO_DEMO = "colaborador.demo@example.com"
PASSWORD_DEMO = "Colaborador123*"


@pytest.fixture(autouse=True)
def _esquema_limpio():
    """Recrea el esquema completo antes de cada prueba: aislamiento total."""
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def datos_base(db):
    """Rol admin + dos eventos con sus agendas (misma área, "Masaje de relajación" y "Silla
    de masajes", 08:00-17:00, almuerzo 12:00-13:00) + un colaborador CON CUENTA creada."""
    rol = Rol(nombre="administrador", descripcion="Acceso total")
    db.add(rol)
    db.flush()

    admin = Administrador(
        usuario="admin", nombre="Admin Test",
        hash_password=hash_password("Admin123*"), rol_id=rol.id,
    )
    area = Area(nombre="Oficinas")
    servicio = Servicio(
        nombre="Masaje de relajación", descripcion_corta="Sesión de bienestar",
        duracion_minutos=30,
    )
    servicio2 = Servicio(
        nombre="Silla de masajes", descripcion_corta="Sesión rápida", duracion_minutos=15,
    )
    db.add_all([admin, area, servicio, servicio2])
    db.flush()

    agenda = Agenda(
        nombre="Masajes - Oficinas", area_id=area.id, servicio_id=servicio.id,
        hora_inicio=time(8, 0), hora_fin=time(17, 0),
        almuerzo_inicio=time(12, 0), almuerzo_fin=time(13, 0),
        duracion_minutos=30, dias_habilitados="0,1,2,3,4,5,6", activo=True,
    )
    agenda2 = Agenda(
        nombre="Silla - Oficinas", area_id=area.id, servicio_id=servicio2.id,
        hora_inicio=time(8, 0), hora_fin=time(17, 0),
        almuerzo_inicio=time(12, 0), almuerzo_fin=time(13, 0),
        duracion_minutos=15, dias_habilitados="0,1,2,3,4,5,6", activo=True,
    )
    usuario = Usuario(
        nombre="Colaborador", apellido="Demo", correo=CORREO_DEMO,
        password_hash=hash_password(PASSWORD_DEMO),
    )
    db.add_all([agenda, agenda2, usuario])
    db.commit()

    return {
        "admin_id": admin.id, "area_id": area.id,
        "servicio_id": servicio.id, "agenda_id": agenda.id,
        "servicio2_id": servicio2.id, "agenda2_id": agenda2.id,
        "usuario_id": usuario.id,
    }


@pytest.fixture
def client(datos_base):
    """TestClient contra la BD real de pruebas (comparte el mismo engine que la app)."""
    def _get_db_override():
        session = SessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = _get_db_override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def token_admin(client):
    r = client.post("/api/v1/auth/login", json={"usuario": "admin", "password": "Admin123*"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture
def headers_admin(token_admin):
    return {"Authorization": f"Bearer {token_admin}"}


@pytest.fixture
def token_usuario(client):
    r = client.post("/api/v1/cuenta/login", json={"correo": CORREO_DEMO, "password": PASSWORD_DEMO})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture
def headers_usuario(token_usuario):
    return {"Authorization": f"Bearer {token_usuario}"}
