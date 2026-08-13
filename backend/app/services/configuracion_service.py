from datetime import date

from sqlalchemy.orm import Session

from app.config import settings
from app.repositories.configuracion_repository import ConfiguracionRepository
from app.schemas.configuracion import ConfiguracionGeneralOut, SemanaActivaSet
from app.services import auditoria_service
from app.services.errors import DomainError

CLAVES_PUBLICAS = [
    "empresa_nombre", "sistema_nombre", "logo_url", "color_primario", "color_secundario",
]
CLAVES_ADMIN = CLAVES_PUBLICAS + ["cancelacion_horas_minimas"]


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
