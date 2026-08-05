#!/usr/bin/env bash
set -e

echo "[entrypoint] Aplicando migraciones..."
alembic upgrade head

echo "[entrypoint] Creando administrador inicial / datos de ejemplo..."
python -m scripts.create_admin

echo "[entrypoint] Iniciando API..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
