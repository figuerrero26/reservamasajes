"""Respaldo automático de la base de datos ANTES de aplicar migraciones pendientes.

Uso (lo invoca entrypoint.sh): python -m scripts.respaldo_pre_migracion

- Si la base ya está en la última revisión de Alembic, no hace nada (no llena el disco con
  un respaldo en cada reinicio).
- Si hay migraciones pendientes, genera un volcado SQL completo con `mysqldump`
  (--single-transaction: consistente sin bloquear la base) en BACKUP_DIR y conserva los
  últimos BACKUP_KEEP archivos.
- Si el respaldo falla, termina con código 1: el entrypoint se detiene y NO se migra.
  Es preferible que el backend no arranque a modificar la estructura sin respaldo.
- Una base nueva (sin tabla alembic_version) no se respalda: no hay datos que proteger.
"""
import gzip
import os
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url

from app.config import settings

BACKUP_DIR = Path(os.environ.get("BACKUP_DIR", "backups"))
BACKUP_KEEP = int(os.environ.get("BACKUP_KEEP", "10"))


def revision_actual(engine) -> str | None:
    if "alembic_version" not in inspect(engine).get_table_names():
        return None
    with engine.connect() as conn:
        return conn.execute(text("SELECT version_num FROM alembic_version")).scalar()


def revision_destino() -> str:
    return ScriptDirectory.from_config(Config("alembic.ini")).get_current_head()


def generar_respaldo(revision: str) -> Path:
    url = make_url(settings.database_url)
    marca = datetime.now().strftime("%Y%m%d-%H%M%S")
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    destino = BACKUP_DIR / f"{url.database}-rev{revision}-{marca}.sql.gz"

    binario = shutil.which("mysqldump") or shutil.which("mariadb-dump")
    if not binario:
        raise RuntimeError("No se encontró mysqldump/mariadb-dump en el contenedor")

    comando = [
        binario, f"--host={url.host}", f"--port={url.port or 3306}", f"--user={url.username}",
        "--single-transaction", "--routines", "--triggers", "--default-character-set=utf8mb4",
        url.database,
    ]
    entorno = {**os.environ, "MYSQL_PWD": url.password or ""}  # no aparece en la lista de procesos
    with gzip.open(destino, "wb") as salida:
        proceso = subprocess.run(comando, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=entorno, check=False)
        if proceso.returncode != 0:
            destino.unlink(missing_ok=True)
            raise RuntimeError(proceso.stderr.decode(errors="replace").strip() or "mysqldump falló")
        salida.write(proceso.stdout)
    if destino.stat().st_size < 200:
        raise RuntimeError("El respaldo generado está vacío")
    return destino


def rotar() -> None:
    respaldos = sorted(BACKUP_DIR.glob("*.sql.gz"), key=lambda p: p.stat().st_mtime, reverse=True)
    for viejo in respaldos[BACKUP_KEEP:]:
        viejo.unlink(missing_ok=True)


def main() -> int:
    engine = create_engine(settings.database_url, pool_pre_ping=True)
    actual = revision_actual(engine)
    destino = revision_destino()
    if actual is None:
        print("[respaldo] Base nueva (sin migraciones aplicadas): no hay datos que respaldar.")
        return 0
    if actual == destino:
        print(f"[respaldo] La base ya está en la revisión {actual}: no se requiere respaldo.")
        return 0
    print(f"[respaldo] Migraciones pendientes ({actual} -> {destino}). Generando respaldo...")
    try:
        archivo = generar_respaldo(actual)
    except Exception as exc:
        print(f"[respaldo] ERROR: no se pudo respaldar la base, se cancela la migración: {exc}", file=sys.stderr)
        return 1
    rotar()
    print(f"[respaldo] Respaldo guardado en {archivo} ({archivo.stat().st_size // 1024} KB).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
