"""Fixtures compartidos.

Dos tipos de pruebas conviven aquí:
- **Unitarias puras** (generación de la grilla de turnos, validaciones de esquemas, reglas de
  estado): no tocan la base de datos y corren en cualquier equipo con `pytest`.
- **De integración**: corren contra una MariaDB real (no SQLite), porque la regla de
  concurrencia y la de "una reserva por usuario+evento+día" dependen de la columna generada
  `slot_lock` y de índices únicos propios de MariaDB. Se activan solas al pedir los fixtures
  `db`, `datos_base` o `client`.

La conexión a MariaDB es perezosa: solo se crea la base `reservas_test` la primera vez que
una prueba de integración la necesita.

Variables de entorno usadas: TEST_DATABASE_URL (opcional, URL completa) o, por defecto, las
mismas variables sueltas que usa la app (DB_HOST, DB_PORT, MARIADB_USER, MARIADB_PASSWORD) con
la base de datos "reservas_test", más MARIADB_ROOT_PASSWORD para crearla. Dentro del
contenedor (docker compose exec backend pytest) ya vienen configuradas.
"""
import os

import pytest
from sqlalchemy.engine import URL as SqlAlchemyURL, make_url

if os.environ.get("TEST_DATABASE_URL"):
    _url = make_url(os.environ["TEST_DATABASE_URL"])
else:
    _url = SqlAlchemyURL.create(
        "mysql+pymysql",
        username=os.environ.get("MARIADB_USER", "root"),
        password=os.environ.get("MARIADB_PASSWORD", "root"),
        host=os.environ.get("DB_HOST", "db"),
        port=int(os.environ.get("DB_PORT", "3306")),
        database="reservas_test",
    )
if _url.database != "reservas_test" and not os.environ.get("PERMITIR_BD_PRUEBAS_DISTINTA"):
    # Las pruebas BORRAN y recrean todas las tablas: nunca deben apuntar a la base real.
    raise RuntimeError(f"Las pruebas solo pueden usar la base 'reservas_test', no '{_url.database}'")

# Debe fijarse ANTES de importar cualquier módulo de app.* (config usa lru_cache y
# database/session crea el engine al importarse).
os.environ["DATABASE_URL"] = ""
os.environ["DB_HOST"] = _url.host
os.environ["DB_PORT"] = str(_url.port or 3306)
os.environ["MARIADB_USER"] = _url.username
os.environ["MARIADB_PASSWORD"] = _url.password or ""
os.environ["MARIADB_DATABASE"] = _url.database
os.environ.setdefault("JWT_SECRET", "test-secret")

from datetime import time  # noqa: E402

from app.auth.security import hash_password  # noqa: E402
from app.database.base import Base  # noqa: E402
from app.database.session import SessionLocal, engine, get_db  # noqa: E402
from app.models import Administrador, Agenda, Area, Rol, Servicio, Usuario  # noqa: E402
from app.utils.limiter import limiter  # noqa: E402

CORREO_DEMO = "colaborador.demo@example.com"
PASSWORD_DEMO = "Colaborador123*"

_bd_creada = False


def _asegurar_bd_pruebas() -> None:
    """Crea `reservas_test` (como root) la primera vez que se necesita."""
    global _bd_creada
    if _bd_creada:
        return
    import pymysql

    root_password = os.environ.get("MARIADB_ROOT_PASSWORD", _url.password or "root")
    conn = pymysql.connect(host=_url.host, port=int(_url.port or 3306), user="root", password=root_password)
    try:
        with conn.cursor() as cur:
            cur.execute(f"CREATE DATABASE IF NOT EXISTS `{_url.database}`")
            if _url.username != "root":
                cur.execute(f"GRANT ALL PRIVILEGES ON `{_url.database}`.* TO %s@'%%'", (_url.username,))
                cur.execute("FLUSH PRIVILEGES")
        conn.commit()
    finally:
        conn.close()
    _bd_creada = True


@pytest.fixture(autouse=True)
def _limite_de_intentos_limpio():
    """El rate limiter guarda contadores en memoria por IP: sin esto, las pruebas que inician
    sesión muchas veces seguidas recibirían 429 por acumulación entre pruebas."""
    limiter.reset()
    yield


@pytest.fixture
def esquema_limpio():
    """Recrea el esquema completo antes de cada prueba de integración: aislamiento total."""
    _asegurar_bd_pruebas()
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield


@pytest.fixture
def db(esquema_limpio):
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def datos_base(db):
    """Roles + admin + visor, dos eventos con sus agendas (misma área, 08:00-17:00, almuerzo
    12:00-13:00) + un colaborador CON CUENTA creada."""
    rol = Rol(nombre="administrador", descripcion="Acceso total")
    rol_visor = Rol(nombre="visor_reservas", descripcion="Solo lectura")
    db.add_all([rol, rol_visor])
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
        "admin_id": admin.id, "area_id": area.id, "rol_visor_id": rol_visor.id,
        "servicio_id": servicio.id, "agenda_id": agenda.id,
        "servicio2_id": servicio2.id, "agenda2_id": agenda2.id,
        "usuario_id": usuario.id,
    }


@pytest.fixture
def client(datos_base):
    """TestClient contra la BD real de pruebas (comparte el mismo engine que la app)."""
    from fastapi.testclient import TestClient

    from app.main import app

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
