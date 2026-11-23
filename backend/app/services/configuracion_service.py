import re
import uuid
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.config import settings
from app.repositories.configuracion_repository import ConfiguracionRepository
from app.schemas.configuracion import ConfiguracionGeneralOut, PlantillaCorreoOut
from app.services import auditoria_service
from app.services.email_service import (
    ASUNTO_CONFIRMACION_DEFAULT, CUERPO_CONFIRMACION_DEFAULT, PLACEHOLDERS_CONFIRMACION,
    generar_vista_previa,
)
from app.services.errors import DomainError
from app.utils.uploads import PUBLIC_PREFIX, UPLOAD_DIR

# La semana activa global y la restricción `evento_unico_por_semana` se retiraron en la
# migración 0012: cada evento tiene ahora su propia vigencia y su regla de participación.
# Sus filas antiguas se conservan en la tabla, pero ya no se leen ni se pueden editar.
CLAVES_PUBLICAS = [
    "empresa_nombre", "sistema_nombre", "logo_url", "color_primario", "color_secundario",
    "mensaje_bienvenida", "imagen_bienvenida_url", "color_boton_disponibilidad", "color_fondo_bienvenida",
    "contacto_correo", "contacto_telefono", "contacto_direccion", "terminos_condiciones",
]
CLAVES_ADMIN = CLAVES_PUBLICAS + [
    "cancelacion_horas_minimas", "email_confirmacion_asunto", "email_confirmacion_cuerpo",
    "email_confirmacion_imagen_url",
]

_PATRON_COLOR = re.compile(r"^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$")
_PATRON_CORREO = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_CLAVES_COLOR = {"color_primario", "color_secundario", "color_boton_disponibilidad", "color_fondo_bienvenida"}
_CLAVES_URL = {"logo_url", "imagen_bienvenida_url", "email_confirmacion_imagen_url"}
# Límite de longitud por clave (los textos legales pueden ser largos; el resto, cortos).
_LONGITUD_MAXIMA = {
    "terminos_condiciones": 20000, "mensaje_bienvenida": 2000,
    "email_confirmacion_cuerpo": 5000, "contacto_direccion": 300,
}
_LONGITUD_POR_DEFECTO = 255


def validar_valor_configuracion(clave: str, valor: str | None) -> str | None:
    """Normaliza y valida un valor antes de guardarlo. Un valor inválido guardado aquí
    afectaría a todo el portal (colores en estilos, horas mínimas en cada cancelación…),
    por eso se rechaza en vez de guardarse tal cual. Cadena vacía = sin valor (None)."""
    if valor is None:
        return None
    valor = valor.strip()
    if valor == "":
        return None
    if len(valor) > _LONGITUD_MAXIMA.get(clave, _LONGITUD_POR_DEFECTO):
        raise DomainError("El valor es demasiado largo para este campo.")
    if clave in _CLAVES_COLOR and not _PATRON_COLOR.fullmatch(valor):
        raise DomainError("El color debe tener formato hexadecimal, por ejemplo #1F3A5F.")
    if clave in _CLAVES_URL and not (valor.startswith(("http://", "https://")) or valor.startswith(f"{PUBLIC_PREFIX}/")):
        raise DomainError("La URL debe empezar por http:// o https://.")
    if clave == "cancelacion_horas_minimas":
        if not valor.isdigit() or int(valor) > 720:
            raise DomainError("Las horas mínimas de cancelación deben ser un número entero entre 0 y 720.")
        valor = str(int(valor))
    if clave == "contacto_correo" and not _PATRON_CORREO.fullmatch(valor):
        raise DomainError("El correo de contacto no es válido.")
    return valor

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

# El logo solo admite imágenes estáticas (sin GIF ni video) y un tope pequeño: se muestra en
# el encabezado de cada página, nunca debe pesar.
TIPOS_LOGO_PERMITIDOS: dict[str, tuple[str, int]] = {
    "image/jpeg": (".jpg", 2 * _MB),
    "image/png": (".png", 2 * _MB),
    "image/webp": (".webp", 2 * _MB),
}


class ConfiguracionService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = ConfiguracionRepository(db)

    def obtener_publica(self) -> ConfiguracionGeneralOut:
        valores = self.repo.get_all()
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
            contacto_correo=valores.get("contacto_correo"),
            contacto_telefono=valores.get("contacto_telefono"),
            contacto_direccion=valores.get("contacto_direccion"),
            terminos_condiciones=valores.get("terminos_condiciones"),
            zona_horaria=settings.APP_TIMEZONE,
        )

    def actualizar(self, clave: str, valor: str | None, admin_id: int) -> None:
        if clave not in CLAVES_ADMIN:
            raise DomainError(f"Clave de configuración no reconocida: {clave}")
        valor = validar_valor_configuracion(clave, valor)
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

    async def guardar_logo(self, archivo: UploadFile, admin_id: int) -> str:
        """Sube el logo al propio servidor en vez de depender de una URL externa: un enlace a
        otro sitio puede caerse o dejar de existir sin que el panel se entere (ya pasó)."""
        return await self._guardar_archivo(
            archivo, admin_id, clave="logo_url", prefijo_nombre="logo",
            tipos_permitidos=TIPOS_LOGO_PERMITIDOS,
            mensaje_formato="Formato no soportado. Use una imagen JPG, PNG o WEBP.",
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
