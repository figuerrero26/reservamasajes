"""Imágenes de los eventos (servicios y actividades) subidas desde el panel.

Una imagen se puede definir de dos formas: subiendo un archivo (este módulo lo valida y lo
guarda en el directorio de cargas) o con una URL web. En ambos casos el evento guarda una
URL en `imagen_url`, validada por app/utils/uploads.normalizar_url_imagen.

Reemplazar o quitar la imagen de un evento no borra el archivo en el momento (otro evento
podría estar usando la misma URL, o el administrador podría deshacer el cambio): la tarea
programada elimina después los archivos `evento_*` que ningún evento referencia y que tienen
más de un día (ver `limpiar_imagenes_huerfanas`).
"""
import logging
import time
import uuid
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Actividad, Servicio
from app.services.errors import DomainError
from app.utils.uploads import (
    PREFIJO_IMAGEN_EVENTO, PUBLIC_PREFIX, TAMANO_MAXIMO_IMAGEN_EVENTO, TIPOS_IMAGEN_EVENTO, UPLOAD_DIR,
    es_imagen_valida,
)

logger = logging.getLogger("reservas")

ANTIGUEDAD_MINIMA_HUERFANA_SEG = 24 * 3600


async def guardar_imagen_evento(archivo: UploadFile) -> str:
    """Valida tipo, tamaño y contenido real del archivo, lo guarda con un nombre aleatorio y
    devuelve su URL pública (la que se guarda en el evento)."""
    info = TIPOS_IMAGEN_EVENTO.get(archivo.content_type or "")
    if not info:
        raise DomainError("Formato no soportado. Usa una imagen JPG, PNG, WEBP o GIF.")
    contenido = await archivo.read(TAMANO_MAXIMO_IMAGEN_EVENTO + 1)
    if not contenido:
        raise DomainError("El archivo está vacío.")
    if len(contenido) > TAMANO_MAXIMO_IMAGEN_EVENTO:
        raise DomainError(f"La imagen no puede superar {TAMANO_MAXIMO_IMAGEN_EVENTO // (1024 * 1024)} MB.")
    if not es_imagen_valida(archivo.content_type, contenido):
        raise DomainError("El archivo no es una imagen válida o está dañado.")
    nombre = f"{PREFIJO_IMAGEN_EVENTO}{uuid.uuid4().hex}{info[0]}"
    (UPLOAD_DIR / nombre).write_bytes(contenido)
    return f"{PUBLIC_PREFIX}/{nombre}"


def _referenciadas(db: Session) -> set[str]:
    """Nombres de archivo subidos que algún evento usa como imagen (activo o no, vigente o
    finalizado: el historial conserva su imagen)."""
    nombres: set[str] = set()
    for modelo in (Servicio, Actividad):
        for url in db.execute(select(modelo.imagen_url).where(modelo.imagen_url.is_not(None))).scalars():
            if url.startswith(f"{PUBLIC_PREFIX}/"):
                nombres.add(Path(url).name)
    return nombres


def limpiar_imagenes_huerfanas(db: Session, antiguedad_minima_seg: int = ANTIGUEDAD_MINIMA_HUERFANA_SEG) -> list[str]:
    """Elimina los archivos de imagen de eventos que ningún evento referencia y que tienen
    más de `antiguedad_minima_seg` (así no se borra una imagen recién subida cuyo formulario
    todavía no se ha guardado). Solo toca archivos con el prefijo de imágenes de eventos."""
    usadas = _referenciadas(db)
    limite = time.time() - antiguedad_minima_seg
    borradas = []
    for archivo in UPLOAD_DIR.glob(f"{PREFIJO_IMAGEN_EVENTO}*"):
        try:
            if archivo.is_file() and archivo.name not in usadas and archivo.stat().st_mtime < limite:
                archivo.unlink()
                borradas.append(archivo.name)
        except OSError as exc:  # p. ej. el archivo desapareció entre el listado y el borrado
            logger.warning("No se pudo limpiar la imagen %s: %s", archivo.name, exc)
    if borradas:
        logger.info("Imágenes de eventos sin uso eliminadas: %s", ", ".join(borradas))
    return borradas
