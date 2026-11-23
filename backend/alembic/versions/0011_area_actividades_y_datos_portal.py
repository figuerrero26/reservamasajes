"""Área en las actividades, nuevo título del portal y datos de contacto.

Cambios de estructura (aditivos):
- `actividades.area_id`: el área a la que pertenece cada actividad. Obligatoria para crear
  o editar (validado en la API); la columna admite NULL solo para las actividades que ya
  existían, que el panel marca como "sin área" para asignarla sin perder nada.

Cambios de datos (no destructivos, solicitados para la Semana Sigra Vive):
- Título del portal: "… | Reserva tu Masaje" pasa a "… | Reserva un espacio" en cualquier
  valor de configuración que lo contenga (nombre del sistema, plantillas de correo…).
- Contacto del pie de página y de los correos: talentohumano@sigra.com y +57 3152579481,
  SOLO si todavía no hay un valor configurado (nunca reemplaza uno existente).

El downgrade revierte la estructura; los datos de configuración se conservan (son textos
editables desde el panel). Antes de aplicar esta migración el entrypoint genera un respaldo
completo de la base (scripts/respaldo_pre_migracion.py).

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CONTACTO = {
    "contacto_correo": "talentohumano@sigra.com",
    "contacto_telefono": "+57 3152579481",
}


def upgrade() -> None:
    op.add_column("actividades", sa.Column("area_id", sa.Integer(), nullable=True))
    # Índice antes que la llave foránea: MariaDB la apoya en él en vez de crear otro.
    op.create_index("ix_actividades_area_id", "actividades", ["area_id"])
    op.create_foreign_key("fk_actividad_area", "actividades", "areas", ["area_id"], ["id"])

    op.execute(
        "UPDATE configuracion_general "
        "SET valor = REPLACE(REPLACE(valor, 'Reserva tu Masaje', 'Reserva un espacio'), "
        "'Reserva tu masaje', 'Reserva un espacio') "
        "WHERE valor LIKE '%Reserva tu Masaje%' OR valor LIKE '%Reserva tu masaje%'"
    )
    for clave, valor in CONTACTO.items():
        # Inserta si no existe la clave; si existe pero está vacía, la completa; si ya tiene
        # un valor, lo deja intacto. Una sola sentencia: funciona también en modo offline.
        op.execute(
            "INSERT INTO configuracion_general (clave, valor) "
            f"VALUES ('{clave}', '{valor}') "
            "ON DUPLICATE KEY UPDATE valor = IF(valor IS NULL OR TRIM(valor) = '', VALUES(valor), valor)"
        )


def downgrade() -> None:
    op.drop_constraint("fk_actividad_area", "actividades", type_="foreignkey")
    op.drop_index("ix_actividades_area_id", table_name="actividades")
    op.drop_column("actividades", "area_id")
