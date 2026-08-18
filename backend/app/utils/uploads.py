"""Directorio de archivos subidos desde el panel (imágenes). Persiste como bind mount
(ver docker-compose.yml: ./data/uploads:/app/uploads), igual que los datos de MariaDB."""
from pathlib import Path

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

PUBLIC_PREFIX = "/api/uploads"
