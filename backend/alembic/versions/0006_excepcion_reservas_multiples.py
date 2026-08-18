"""La excepción `usuarios.permite_reservas_multiples` no tenía ningún efecto real: el índice
único `uq_reserva_activa_evento_dia` bloqueaba repetir el mismo evento el mismo día para
TODOS los usuarios sin importar el flag, porque reutilizaba la misma columna generada
`slot_lock` que protege el slot exacto (esa nunca debe tener excepción).

Se agrega `permite_multiple_evento_dia` (foto de `usuario.permite_reservas_multiples` al
crear la reserva) y una columna generada aparte `slot_lock_evento_dia` que sí la respeta.
El índice `uq_reserva_activa_evento_dia` pasa a usar esta nueva columna.

Revision ID: 0006
Revises: 0005
Create Date: 2026-08-14
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "reservas",
        sa.Column("permite_multiple_evento_dia", sa.Boolean, nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "reservas",
        sa.Column(
            "slot_lock_evento_dia", sa.String(1),
            sa.Computed(
                "IF(estado = 'activa' AND permite_multiple_evento_dia = 0, 'A', NULL)",
                persisted=True,
            ),
        ),
    )
    op.drop_index("uq_reserva_activa_evento_dia", table_name="reservas")
    op.create_index(
        "uq_reserva_activa_evento_dia", "reservas",
        ["usuario_id", "servicio_id", "fecha", "slot_lock_evento_dia"], unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_reserva_activa_evento_dia", table_name="reservas")
    op.create_index(
        "uq_reserva_activa_evento_dia", "reservas",
        ["usuario_id", "servicio_id", "fecha", "slot_lock"], unique=True,
    )
    op.drop_column("reservas", "slot_lock_evento_dia")
    op.drop_column("reservas", "permite_multiple_evento_dia")
