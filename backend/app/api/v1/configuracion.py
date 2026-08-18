from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin_full
from app.database.session import get_db
from app.schemas.configuracion import ConfiguracionGeneralOut, ConfiguracionValor
from app.schemas.smtp import SmtpConfigOut, SmtpConfigUpdate, SmtpPruebaRequest
from app.services.configuracion_service import ConfiguracionService
from app.services.smtp_config_service import SmtpConfigService

router = APIRouter(prefix="/configuracion", tags=["configuracion"])


@router.get("", response_model=ConfiguracionGeneralOut)
def obtener(db: Session = Depends(get_db)):
    """Pública: branding y datos no sensibles que necesita el portal."""
    return ConfiguracionService(db).obtener_publica()


@router.put("", status_code=204)
def actualizar(data: ConfiguracionValor, db: Session = Depends(get_db),
               admin: dict = Depends(get_current_admin_full)):
    ConfiguracionService(db).actualizar(data.clave, data.valor, admin["id"])


@router.post("/imagen-bienvenida")
async def subir_imagen_bienvenida(archivo: UploadFile = File(...), db: Session = Depends(get_db),
                                   admin: dict = Depends(get_current_admin_full)):
    url = await ConfiguracionService(db).guardar_imagen_bienvenida(archivo, admin["id"])
    return {"imagen_bienvenida_url": url}


@router.get("/smtp", response_model=SmtpConfigOut)
def obtener_smtp(db: Session = Depends(get_db), _: dict = Depends(get_current_admin_full)):
    """La contraseña nunca se incluye en la respuesta, solo si hay una guardada."""
    return SmtpConfigService(db).obtener()


@router.put("/smtp", response_model=SmtpConfigOut)
def actualizar_smtp(data: SmtpConfigUpdate, db: Session = Depends(get_db),
                     admin: dict = Depends(get_current_admin_full)):
    return SmtpConfigService(db).actualizar(data, admin["id"])


@router.post("/smtp/prueba", status_code=204)
def probar_smtp(data: SmtpPruebaRequest, db: Session = Depends(get_db),
                 admin: dict = Depends(get_current_admin_full)):
    SmtpConfigService(db).enviar_prueba(data.destinatario, admin["id"])
