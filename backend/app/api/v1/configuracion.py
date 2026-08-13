from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
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
               admin: dict = Depends(get_current_admin)):
    ConfiguracionService(db).actualizar(data.clave, data.valor, admin["id"])


@router.get("/smtp", response_model=SmtpConfigOut)
def obtener_smtp(db: Session = Depends(get_db), _: dict = Depends(get_current_admin)):
    """La contraseña nunca se incluye en la respuesta, solo si hay una guardada."""
    return SmtpConfigService(db).obtener()


@router.put("/smtp", response_model=SmtpConfigOut)
def actualizar_smtp(data: SmtpConfigUpdate, db: Session = Depends(get_db),
                     admin: dict = Depends(get_current_admin)):
    return SmtpConfigService(db).actualizar(data, admin["id"])


@router.post("/smtp/prueba", status_code=204)
def probar_smtp(data: SmtpPruebaRequest, db: Session = Depends(get_db),
                 admin: dict = Depends(get_current_admin)):
    SmtpConfigService(db).enviar_prueba(data.destinatario, admin["id"])
