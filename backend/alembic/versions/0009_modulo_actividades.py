"""Módulo genérico de actividades/sesiones/inscripciones.

A diferencia de servicios/agendas/reservas (pensado para "un día de la semana que se repite,
una persona por turno exacto"), este módulo cubre actividades que no encajan ahí: cupos
grupales, fechas únicas (no recurrentes), número variable de sesiones, ventana de inscripción
independiente de la disponibilidad del turno, y un formulario configurable por actividad.

`Inscripcion` reutiliza el mismo patrón que `Reserva`: identidad fotografiada
(usuario_nombre/apellido/correo) para que sobreviva a la eliminación de la cuenta, columna
generada `slot_lock` para que el índice único solo aplique a inscripciones activas (evita
que una persona tenga dos inscripciones activas a la misma sesión, sin bloquear si cancela
y se vuelve a inscribir).

Revision ID: 0009
Revises: 0008
Create Date: 2026-08-25
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "actividades",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("nombre", sa.String(160), nullable=False),
        sa.Column("descripcion_corta", sa.String(300), nullable=True),
        sa.Column("descripcion_larga", sa.Text(), nullable=True),
        sa.Column("imagen_url", sa.String(500), nullable=True),
        sa.Column("informacion_adicional", sa.Text(), nullable=True),
        # JSON serializado: lista de campos del formulario de inscripción (ver
        # app/schemas/actividad.py: CampoFormulario).
        sa.Column("campos_formulario", sa.Text(), nullable=True),
        sa.Column("inscripcion_abierta", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("fecha_apertura_inscripciones", sa.DateTime(), nullable=True),
        sa.Column("fecha_cierre_inscripciones", sa.DateTime(), nullable=True),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
    )

    op.create_table(
        "sesiones",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("actividad_id", sa.Integer(), sa.ForeignKey("actividades.id"), nullable=False),
        sa.Column("fecha", sa.Date(), nullable=False),
        sa.Column("hora_inicio", sa.Time(), nullable=False),
        sa.Column("hora_fin", sa.Time(), nullable=False),
        # NULL = sin límite de participantes.
        sa.Column("cupo_maximo", sa.Integer(), nullable=True),
        sa.Column("activa", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index("ix_sesiones_actividad_id", "sesiones", ["actividad_id"])
    op.create_index("ix_sesiones_fecha", "sesiones", ["fecha"])

    op.create_table(
        "inscripciones",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("sesion_id", sa.Integer(), sa.ForeignKey("sesiones.id"), nullable=False),
        sa.Column(
            "usuario_id", sa.Integer(),
            sa.ForeignKey("usuarios.id", ondelete="SET NULL", name="fk_inscripcion_usuario"),
            nullable=True,
        ),
        sa.Column("usuario_nombre", sa.String(120), nullable=False),
        sa.Column("usuario_apellido", sa.String(120), nullable=False, server_default=""),
        sa.Column("usuario_correo", sa.String(160), nullable=True),
        # JSON serializado: respuestas al formulario configurable de la actividad.
        sa.Column("respuestas_formulario", sa.Text(), nullable=True),
        sa.Column("estado", sa.String(20), nullable=False, server_default="activa"),
        sa.Column(
            "slot_lock", sa.String(1),
            sa.Computed("IF(estado = 'activa', 'A', NULL)", persisted=True),
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.Column("cancelled_at", sa.DateTime(), nullable=True),
        sa.Column("cancelled_by", sa.String(80), nullable=True),
    )
    op.create_index("ix_inscripciones_sesion_id", "inscripciones", ["sesion_id"])
    op.create_index("ix_inscripciones_usuario_id", "inscripciones", ["usuario_id"])
    op.create_index(
        "uq_inscripcion_activa_usuario_sesion", "inscripciones",
        ["usuario_id", "sesion_id", "slot_lock"], unique=True,
    )


def downgrade() -> None:
    op.drop_table("inscripciones")
    op.drop_table("sesiones")
    op.drop_table("actividades")
