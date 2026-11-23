from fastapi import APIRouter, Depends, File, UploadFile, status

from app.api.deps import get_current_admin_full
from app.services.imagen_service import guardar_imagen_evento

router = APIRouter(prefix="/uploads", tags=["uploads"])


@router.post("/imagenes", status_code=status.HTTP_201_CREATED)
async def subir_imagen_evento(archivo: UploadFile = File(...), _: dict = Depends(get_current_admin_full)):
    """Sube la imagen de un evento (JPG, PNG, WEBP o GIF, máximo 5 MB; se verifica el
    contenido real del archivo). Devuelve la URL que el formulario guarda en `imagen_url`."""
    return {"url": await guardar_imagen_evento(archivo)}
