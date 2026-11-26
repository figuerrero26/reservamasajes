"""Separa la publicación del horario de reservas e inscripciones."""

import sqlalchemy as sa
from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for tabla in ("actividades", "servicios"):
        op.add_column(tabla, sa.Column("publicacion_en", sa.DateTime(), nullable=True))
        op.add_column(tabla, sa.Column("hora_apertura", sa.Time(), nullable=True))
        op.add_column(tabla, sa.Column("hora_cierre", sa.Time(), nullable=True))

    # Recuperar las horas descartadas por 0012 cuando corresponden al periodo actual.
    for columna, anterior, fecha in (
        ("hora_apertura", "fecha_apertura_inscripciones", "vigencia_inicio"),
        ("hora_cierre", "fecha_cierre_inscripciones", "vigencia_fin"),
    ):
        op.execute(
            f"UPDATE actividades SET {columna} = TIME({anterior}), updated_at = updated_at "
            f"WHERE DATE({anterior}) = {fecha}"
        )
    # Conservar la vigencia por días si el rango histórico no representa un horario válido.
    op.execute(
        "UPDATE actividades SET hora_cierre = NULL, updated_at = updated_at "
        "WHERE vigencia_inicio = vigencia_fin AND hora_cierre <= COALESCE(hora_apertura, '00:00:00')"
    )


def downgrade() -> None:
    for tabla in ("actividades", "servicios"):
        for columna in ("hora_cierre", "hora_apertura", "publicacion_en"):
            op.drop_column(tabla, columna)
