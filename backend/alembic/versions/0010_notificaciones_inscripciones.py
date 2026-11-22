"""Correos de inscripciones, lugar de la sesión e índice faltante de inscripciones.

Cambios 100 % aditivos (no borra ni modifica filas existentes):
- `notificaciones.inscripcion_id`: los correos de confirmación/cancelación de inscripciones
  a actividades quedan enlazados a su inscripción, igual que los de reservas.
- `sesiones.lugar`: lugar o punto de encuentro, opcional.
- `ix_inscripciones_estado`: el modelo declaraba este índice pero la migración 0009 no lo
  creaba (diferencia entre modelo y esquema real).

Antes de aplicar cualquier migración, el entrypoint del backend genera un respaldo completo
de la base (ver scripts/respaldo_pre_migracion.py).

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-22
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("notificaciones", sa.Column("inscripcion_id", sa.Integer(), nullable=True))
    # El índice va ANTES que la llave foránea: así MariaDB la apoya en este índice en vez de
    # crear uno implícito adicional (quedarían dos índices sobre la misma columna).
    op.create_index("ix_notificaciones_inscripcion_id", "notificaciones", ["inscripcion_id"])
    op.create_foreign_key(
        "fk_notificacion_inscripcion", "notificaciones", "inscripciones",
        ["inscripcion_id"], ["id"], ondelete="SET NULL",
    )

    op.add_column("sesiones", sa.Column("lugar", sa.String(200), nullable=True))

    op.create_index("ix_inscripciones_estado", "inscripciones", ["estado"])


def downgrade() -> None:
    op.drop_index("ix_inscripciones_estado", table_name="inscripciones")
    op.drop_column("sesiones", "lugar")
    # La llave foránea primero: MariaDB no permite borrar un índice que una FK está usando.
    op.drop_constraint("fk_notificacion_inscripcion", "notificaciones", type_="foreignkey")
    op.drop_index("ix_notificaciones_inscripcion_id", table_name="notificaciones")
    op.drop_column("notificaciones", "inscripcion_id")
