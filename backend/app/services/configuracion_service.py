import uuid
from datetime import date
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.config import settings
from app.repositories.configuracion_repository import ConfiguracionRepository
from app.schemas.configuracion import ConfiguracionGeneralOut, PlantillaCorreoOut, SemanaActivaSet
from app.services import auditoria_service
from app.services.email_service import (
    ASUNTO_CONFIRMACION_DEFAULT, CUERPO_CONFIRMACION_DEFAULT, PLACEHOLDERS_CONFIRMACION,
    generar_vista_previa,
)
from app.services.errors import DomainError
from app.utils.uploads import PUBLIC_PREFIX, UPLOAD_DIR

CLAVES_PUBLICAS = [
    "empresa_nombre", "sistema_nombre", "logo_url", "color_primario", "color_secundario",
    "mensaje_bienvenida", "imagen_bienvenida_url", "color_boton_disponibilidad", "color_fondo_bienvenida",
    "evento_unico_por_semana",
]
CLAVES_ADMIN = CLAVES_PUBLICAS + [
    "cancelacion_horas_minimas", "email_confirmacion_asunto", "email_confirmacion_cuerpo",
    "email_confirmacion_imagen_url",
]

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

# El banner del correo solo admite imágenes (nunca video: no se puede incrustar en un correo)
# y con un tope menor, para que el mensaje no quede pesado.
TIPOS_IMAGEN_CORREO_PERMITIDOS: dict[str, tuple[str, int]] = {
    "image/jpeg": (".jpg", 3 * _MB),
    "image/png": (".png", 3 * _MB),
    "image/webp": (".webp", 3 * _MB),
    "image/gif": (".gif", 5 * _MB),
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

    async def _guardar_archivo(
        self, archivo: UploadFile, admin_id: int, *, clave: str, prefijo_nombre: str,
        tipos_permitidos: dict[str, tuple[str, int]], mensaje_formato: str,
    ) -> str:
        info = tipos_permitidos.get(archivo.content_type)
        if not info:
            raise DomainError(mensaje_formato)
        extension, tamano_maximo = info
        contenido = await archivo.read()
        if len(contenido) > tamano_maximo:
            raise DomainError(f"El archivo no puede superar {tamano_maximo // _MB} MB.")

        anterior = self.repo.get(clave)
        nombre = f"{prefijo_nombre}_{uuid.uuid4().hex}{extension}"
        (UPLOAD_DIR / nombre).write_bytes(contenido)
        url = f"{PUBLIC_PREFIX}/{nombre}"

        self.actualizar(clave, url, admin_id)

        if anterior and anterior.startswith(f"{PUBLIC_PREFIX}/"):
            (UPLOAD_DIR / Path(anterior).name).unlink(missing_ok=True)

        return url

    async def guardar_imagen_bienvenida(self, archivo: UploadFile, admin_id: int) -> str:
        return await self._guardar_archivo(
            archivo, admin_id, clave="imagen_bienvenida_url", prefijo_nombre="bienvenida",
            tipos_permitidos=TIPOS_BIENVENIDA_PERMITIDOS,
            mensaje_formato="Formato no soportado. Use una imagen (JPG, PNG, WEBP, GIF) o un video (MP4, WEBM, MOV).",
        )

    async def guardar_imagen_correo(self, archivo: UploadFile, admin_id: int) -> str:
        return await self._guardar_archivo(
            archivo, admin_id, clave="email_confirmacion_imagen_url", prefijo_nombre="correo",
            tipos_permitidos=TIPOS_IMAGEN_CORREO_PERMITIDOS,
            mensaje_formato="Formato no soportado. Use una imagen (JPG, PNG, WEBP o GIF).",
        )

    def obtener_plantilla_correo(self) -> PlantillaCorreoOut:
        return PlantillaCorreoOut(
            asunto=self.repo.get("email_confirmacion_asunto") or ASUNTO_CONFIRMACION_DEFAULT,
            cuerpo=self.repo.get("email_confirmacion_cuerpo") or CUERPO_CONFIRMACION_DEFAULT,
            imagen_url=self.repo.get("email_confirmacion_imagen_url"),
            placeholders=PLACEHOLDERS_CONFIRMACION,
        )

    def previsualizar_plantilla_correo(self, cuerpo: str) -> str:
        config_general = self.repo.get_all()
        return generar_vista_previa(cuerpo, config_general, config_general.get("email_confirmacion_imagen_url"))

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
