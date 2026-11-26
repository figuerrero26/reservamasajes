"""Agrega una apertura de reservas independiente de las fechas de atención."""

from alembic import op
import sqlalchemy as sa

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("servicios", sa.Column("apertura_reservas_en", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("servicios", "apertura_reservas_en")
