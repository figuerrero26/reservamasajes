import uuid
from datetime import date
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.config import settings
from app.repositories.configuracion_repository import ConfiguracionRepository
from app.schemas.configuracion import ConfiguracionGeneralOut, SemanaActivaSet
from app.services import auditoria_service
from app.services.errors import DomainError
from app.utils.uploads import PUBLIC_PREFIX, UPLOAD_DIR

CLAVES_PUBLICAS = [
    "empresa_nombre", "sistema_nombre", "logo_url", "color_primario", "color_secundario",
    "mensaje_bienvenida", "imagen_bienvenida_url", "color_boton_disponibilidad", "color_fondo_bienvenida",
    "evento_unico_por_semana",
]
CLAVES_ADMIN = CLAVES_PUBLICAS + ["cancelacion_horas_minimas"]

# Extensión y tamaño máximo (bytes) por tipo MIME aceptado para el banner de bienvenida:
# imagen estática, GIF animado o un video corto.
_MB = 1024 * 1024
TIPOS_BIENVENIDA_PERMITIDOS: dict[str, tuple[str, int]] = {
    "image/jpeg": (".jpg", 5 * _MB),
    "image/png": (".png", 5 * _MB),
    "image/webp": (".webp", 5 * _MB),
    "image/gif": (".gif", 10 * _MB),
    "video/mp4": (".mp4", 30 * _MB),
    "video/webm": (".webm", 30 * _MB),
    "video/quicktime": (".mov", 30 * _MB),
}


class ConfiguracionService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = ConfiguracionRepository(db)

    def obtener_publica(self) -> ConfiguracionGeneralOut:
        valores = self.repo.get_all()
        inicio = valores.get("semana_activa_inicio")
        fin = valores.get("semana_activa_fin")
        return ConfiguracionGeneralOut(
            empresa_nombre=valores.get("empresa_nombre"),
            sistema_nombre=valores.get("sistema_nombre"),
            logo_url=valores.get("logo_url"),
            color_primario=valores.get("color_primario"),
            color_secundario=valores.get("color_secundario"),
            mensaje_bienvenida=valores.get("mensaje_bienvenida"),
            imagen_bienvenida_url=valores.get("imagen_bienvenida_url"),
            color_boton_disponibilidad=valores.get("color_boton_disponibilidad"),
            color_fondo_bienvenida=valores.get("color_fondo_bienvenida"),
            evento_unico_por_semana=valores.get("evento_unico_por_semana") == "true",
            zona_horaria=settings.APP_TIMEZONE,
            semana_activa_inicio=date.fromisoformat(inicio) if inicio else None,
            semana_activa_fin=date.fromisoformat(fin) if fin else None,
        )

    def actualizar(self, clave: str, valor: str | None, admin_id: int) -> None:
        if clave not in CLAVES_ADMIN:
            raise DomainError(f"Clave de configuración no reconocida: {clave}")
        anterior = self.repo.get(clave)
        self.repo.set(clave, valor)
        auditoria_service.registrar(
            self.db, admin_id, "actualizar_configuracion", "configuracion_general", None,
            datos_anteriores={clave: anterior}, datos_nuevos={clave: valor},
        )
        self.db.commit()

    async def guardar_imagen_bienvenida(self, archivo: UploadFile, admin_id: int) -> str:
        info = TIPOS_BIENVENIDA_PERMITIDOS.get(archivo.content_type)
        if not info:
            raise DomainError(
                "Formato no soportado. Use una imagen (JPG, PNG, WEBP, GIF) o un video (MP4, WEBM, MOV)."
            )
        extension, tamano_maximo = info
        contenido = await archivo.read()
        if len(contenido) > tamano_maximo:
            raise DomainError(f"El archivo no puede superar {tamano_maximo // _MB} MB.")

        anterior = self.repo.get("imagen_bienvenida_url")
        nombre = f"bienvenida_{uuid.uuid4().hex}{extension}"
        (UPLOAD_DIR / nombre).write_bytes(contenido)
        url = f"{PUBLIC_PREFIX}/{nombre}"

        self.actualizar("imagen_bienvenida_url", url, admin_id)

        if anterior and anterior.startswith(f"{PUBLIC_PREFIX}/"):
            (UPLOAD_DIR / Path(anterior).name).unlink(missing_ok=True)

        return url

    def semana_activa(self) -> tuple[date | None, date | None]:
        inicio = self.repo.get("semana_activa_inicio")
        fin = self.repo.get("semana_activa_fin")
        return (
            date.fromisoformat(inicio) if inicio else None,
            date.fromisoformat(fin) if fin else None,
        )

    def definir_semana_activa(self, data: SemanaActivaSet, admin_id: int) -> None:
        anteriores = {
            "semana_activa_inicio": self.repo.get("semana_activa_inicio"),
            "semana_activa_fin": self.repo.get("semana_activa_fin"),
        }
        self.repo.set("semana_activa_inicio", data.inicio.isoformat())
        self.repo.set("semana_activa_fin", data.fin.isoformat())
        auditoria_service.registrar(
            self.db, admin_id, "definir_semana_activa", "configuracion_general", None,
            datos_anteriores=anteriores,
            datos_nuevos={"semana_activa_inicio": data.inicio.isoformat(),
                         "semana_activa_fin": data.fin.isoformat()},
        )
        self.db.commit()
