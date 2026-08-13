"""Quita cedula/area/cargo de usuarios: la cuenta es solo nombre, apellido, correo y
contraseña. Reemplaza la funcionalidad de importación de empleados por Excel, que quedó
retirada del sistema (el registro público ya no depende de ningún roster).

Revision ID: 0004
Revises: 0003
Create Date: 2026-08-15
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index("ix_usuario_cedula", table_name="usuarios")
    op.drop_constraint("uq_usuario_cedula", "usuarios", type_="unique")
    op.drop_column("usuarios", "cedula")
    op.drop_column("usuarios", "area")
    op.drop_column("usuarios", "cargo")


def downgrade() -> None:
    op.add_column("usuarios", sa.Column("cargo", sa.String(120), nullable=True))
    op.add_column("usuarios", sa.Column("area", sa.String(120), nullable=True))
    op.add_column("usuarios", sa.Column("cedula", sa.String(20), nullable=True))
    op.create_unique_constraint("uq_usuario_cedula", "usuarios", ["cedula"])
    op.create_index("ix_usuario_cedula", "usuarios", ["cedula"])
