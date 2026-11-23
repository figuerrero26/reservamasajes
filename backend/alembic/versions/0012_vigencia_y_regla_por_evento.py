"""Vigencia y regla de participación propias de cada evento.

Cambios de estructura (100 % aditivos, en `servicios` y en `actividades`):
- `vigencia_inicio` / `vigencia_fin` (DATE, días incluidos): periodo en que el evento se
  publica y recibe reservas o inscripciones. Fuera de él, el evento no recibe participaciones
  nuevas, pero sus reservas, inscripciones y notificaciones se conservan intactas.
- `finalizado_en` (DATETIME): cuándo la tarea programada registró el fin de la vigencia
  (solo informativo y de auditoría; la disponibilidad se calcula siempre con la fecha).
- `limite_participaciones` (NULL = sin límite) y `periodo_limite` ('evento' = toda la
  vigencia, 'dia', 'semana' o 'mes'): cuántas participaciones no canceladas puede tener una
  persona en el evento por periodo.

Traslado de datos (no destructivo; ninguna reserva ni inscripción se modifica):
- La semana activa GLOBAL (claves `semana_activa_inicio`/`semana_activa_fin`) pasa a ser la
  vigencia de cada evento por turnos existente. Así ningún evento se reabre solo: si esa
  semana ya terminó, el evento queda "finalizado" hasta que el administrador le defina una
  vigencia nueva.
- La restricción global `evento_unico_por_semana` pasa a cada evento: con la semana activa
  definida equivale a "una reserva por persona durante toda la vigencia" (periodo 'evento');
  si no, a la regla de siempre: una por persona por día (límite 1, periodo 'dia').
- Actividades: la ventana de inscripción (apertura/cierre) se convierte en su vigencia. Sin
  cierre, la vigencia termina el día de su última sesión; sin apertura, empieza el día en
  que se creó. Las actividades quedan sin límite (como hasta ahora: solo se impedía
  inscribirse dos veces en la misma sesión). Las columnas de apertura y cierre se conservan.

Las claves de configuración antiguas NO se borran (quedan sin uso). El downgrade elimina
las columnas nuevas. Antes de aplicar la migración el entrypoint genera un respaldo
completo de la base (scripts/respaldo_pre_migracion.py).

Revision ID: 0012
Revises: 0011
Create Date: 2026-11-24
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0012"
down_revision: Union[str, None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLAS = ("servicios", "actividades")

# Valor de configuración con forma de fecha ISO (AAAA-MM-DD). Los valores los guardaba la
# API ya validados como fecha; el filtro evita convertir cualquier otro texto.
_FECHA_ISO = "valor REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'"


def _config_fecha(clave: str) -> str:
    return (
        f"(SELECT CAST(valor AS DATE) FROM configuracion_general "
        f"WHERE clave = '{clave}' AND {_FECHA_ISO})"
    )


# Traslado de datos, en orden. Lista aparte para que la suite de pruebas pueda ejecutar
# exactamente estas sentencias contra MariaDB (tests/test_vigencia_restricciones.py).
SENTENCIAS_DATOS = (
    # ---- Eventos por turnos ----
    # La regla fija que existía hasta ahora (índice único): una reserva por persona por día.
    "UPDATE servicios SET limite_participaciones = 1",
    "UPDATE servicios SET "
    f"vigencia_inicio = {_config_fecha('semana_activa_inicio')}, "
    f"vigencia_fin = {_config_fecha('semana_activa_fin')}",
    "UPDATE servicios SET periodo_limite = 'evento' "
    "WHERE vigencia_inicio IS NOT NULL AND vigencia_fin IS NOT NULL "
    "AND EXISTS (SELECT 1 FROM configuracion_general "
    "WHERE clave = 'evento_unico_por_semana' AND valor = 'true')",
    # ---- Actividades con inscripción ----
    "UPDATE actividades SET "
    "vigencia_inicio = DATE(COALESCE(fecha_apertura_inscripciones, created_at)), "
    "vigencia_fin = COALESCE(DATE(fecha_cierre_inscripciones), "
    "(SELECT MAX(s.fecha) FROM sesiones s WHERE s.actividad_id = actividades.id))",
    # Coherencia: el inicio nunca queda después del fin (p. ej. una actividad creada después
    # de la fecha de su última sesión).
    "UPDATE actividades SET vigencia_inicio = vigencia_fin "
    "WHERE vigencia_fin IS NOT NULL AND vigencia_inicio > vigencia_fin",
)


def upgrade() -> None:
    for tabla, periodo in (("servicios", "dia"), ("actividades", "evento")):
        op.add_column(tabla, sa.Column("vigencia_inicio", sa.Date(), nullable=True))
        op.add_column(tabla, sa.Column("vigencia_fin", sa.Date(), nullable=True))
        op.add_column(tabla, sa.Column("finalizado_en", sa.DateTime(), nullable=True))
        op.add_column(tabla, sa.Column("limite_participaciones", sa.Integer(), nullable=True))
        op.add_column(tabla, sa.Column(
            "periodo_limite", sa.String(10), nullable=False, server_default=periodo,
        ))
        op.create_index(f"ix_{tabla}_vigencia_inicio", tabla, ["vigencia_inicio"])
        op.create_index(f"ix_{tabla}_vigencia_fin", tabla, ["vigencia_fin"])

    for sentencia in SENTENCIAS_DATOS:
        op.execute(sentencia)


def downgrade() -> None:
    for tabla in reversed(TABLAS):
        op.drop_index(f"ix_{tabla}_vigencia_fin", table_name=tabla)
        op.drop_index(f"ix_{tabla}_vigencia_inicio", table_name=tabla)
        for columna in ("periodo_limite", "limite_participaciones", "finalizado_en", "vigencia_fin", "vigencia_inicio"):
            op.drop_column(tabla, columna)
