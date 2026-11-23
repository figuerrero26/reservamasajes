"""Directorio de archivos subidos desde el panel (imágenes). Persiste como bind mount
(ver docker-compose.yml: ./data/uploads:/app/uploads), igual que los datos de MariaDB."""
from pathlib import Path

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

PUBLIC_PREFIX = "/api/uploads"

# Prefijo de los archivos de imagen de eventos (servicios y actividades). La tarea
# programada solo limpia archivos con este prefijo que ningún evento referencia.
PREFIJO_IMAGEN_EVENTO = "evento_"

_MB = 1024 * 1024
# Imágenes de eventos: tipo MIME → (extensión, firmas válidas de los primeros bytes).
TIPOS_IMAGEN_EVENTO: dict[str, tuple[str, tuple[bytes, ...]]] = {
    "image/jpeg": (".jpg", (b"\xff\xd8\xff",)),
    "image/png": (".png", (b"\x89PNG\r\n\x1a\n",)),
    "image/webp": (".webp", (b"RIFF",)),  # + "WEBP" en los bytes 8–12 (ver es_imagen_valida)
    "image/gif": (".gif", (b"GIF87a", b"GIF89a")),
}
TAMANO_MAXIMO_IMAGEN_EVENTO = 5 * _MB


def es_imagen_valida(tipo: str, contenido: bytes) -> bool:
    """Comprueba que el contenido sea realmente del tipo declarado (firma de archivo): el
    tipo MIME lo manda el navegador y no basta por sí solo."""
    info = TIPOS_IMAGEN_EVENTO.get(tipo)
    if not info:
        return False
    if not any(contenido.startswith(firma) for firma in info[1]):
        return False
    if tipo == "image/webp":
        return contenido[8:12] == b"WEBP"
    return True


def url_imagen_valida(valor: str) -> bool:
    """Una imagen de evento es una URL web (http/https) o un archivo subido al servidor."""
    return valor.startswith(("http://", "https://")) or valor.startswith(f"{PUBLIC_PREFIX}/")


def normalizar_url_imagen(valor: str | None) -> str | None:
    """Validador compartido por los esquemas de eventos: vacío = sin imagen; cualquier otro
    esquema (javascript:, data:, rutas relativas…) se rechaza."""
    if valor is None:
        return None
    valor = valor.strip()
    if not valor:
        return None
    if " " in valor or not url_imagen_valida(valor):
        raise ValueError("La imagen debe ser una URL que empiece por http:// o https://, o un archivo subido.")
    return valor
