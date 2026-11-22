#!/usr/bin/env bash
set -e

echo "[entrypoint] Verificando si hace falta respaldar la base antes de migrar..."
python -m scripts.respaldo_pre_migracion

echo "[entrypoint] Aplicando migraciones..."
alembic upgrade head

echo "[entrypoint] Creando administrador inicial / datos de ejemplo..."
python -m scripts.create_admin

echo "[entrypoint] Iniciando API..."
# --proxy-headers + --forwarded-allow-ips: detrás de nginx, la IP real del cliente llega en
# X-Forwarded-For. Sin esto, todas las peticiones parecen venir del contenedor de nginx: el
# límite de intentos de login sería compartido por TODOS los usuarios y la auditoría
# registraría siempre la misma IP.
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 \
  --proxy-headers --forwarded-allow-ips="${FORWARDED_ALLOW_IPS:-*}"
