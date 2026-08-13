"""Reemplaza la regla "una reserva activa en todo el sistema" por "una reserva activa por
usuario, por evento, por día" (sin importar la hora ni el área/agenda).

Agrega `reservas.servicio_id` (desnormalizado desde `agendas.servicio_id`, necesario porque
un índice único solo puede referenciar columnas de la propia tabla) y un segundo índice único
sobre (usuario_id, servicio_id, fecha, slot_lock) que reutiliza la misma columna generada
`slot_lock` que ya protege el slot exacto (agenda_id, fecha, hora_inicio).

Revision ID: 0005
Revises: 0004
Create Date: 2026-08-15
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("reservas", sa.Column("servicio_id", sa.Integer, nullable=True))
    op.execute(
        "UPDATE reservas r JOIN agendas a ON r.agenda_id = a.id SET r.servicio_id = a.servicio_id"
    )
    op.alter_column("reservas", "servicio_id", existing_type=sa.Integer, nullable=False)
    op.create_foreign_key(
        "fk_reserva_servicio", "reservas", "servicios", ["servicio_id"], ["id"],
    )
    op.create_index("ix_reserva_servicio", "reservas", ["servicio_id"])
    op.create_index(
        "uq_reserva_activa_evento_dia", "reservas",
        ["usuario_id", "servicio_id", "fecha", "slot_lock"], unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_reserva_activa_evento_dia", table_name="reservas")
    op.drop_index("ix_reserva_servicio", table_name="reservas")
    op.drop_constraint("fk_reserva_servicio", "reservas", type_="foreignkey")
    op.drop_column("reservas", "servicio_id")
