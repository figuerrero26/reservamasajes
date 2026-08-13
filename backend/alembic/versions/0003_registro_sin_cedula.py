"""El registro público ya no exige cédula: usuarios.cedula pasa a ser opcional

Revision ID: 0003
Revises: 0002
Create Date: 2026-08-14
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "usuarios", "cedula", existing_type=sa.String(20), nullable=True,
    )


def downgrade() -> None:
    # No se puede volver a NOT NULL de forma segura si ya existen filas con cedula NULL
    # (registros públicos sin cédula); se deja constancia explícita en vez de fallar en
    # silencio o borrar datos.
    op.alter_column(
        "usuarios", "cedula", existing_type=sa.String(20), nullable=False,
    )
