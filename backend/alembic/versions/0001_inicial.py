"""Esquema inicial

Revision ID: 0001
Revises:
Create Date: 2026-08-05
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "administrador",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("usuario", sa.String(80), nullable=False),
        sa.Column("nombre", sa.String(120), nullable=False),
        sa.Column("hash_password", sa.String(255), nullable=False),
        sa.Column("rol", sa.String(40), nullable=False, server_default="admin"),
        sa.Column("activo", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint("usuario", name="uq_admin_usuario"),
    )
    op.create_index("ix_admin_usuario", "administrador", ["usuario"])

    op.create_table(
        "usuarios",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("cedula", sa.String(20), nullable=False),
        sa.Column("nombre_completo", sa.String(160), nullable=False),
        sa.Column("area", sa.String(120)),
        sa.Column("cargo", sa.String(120)),
        sa.Column("correo", sa.String(160)),
        sa.Column("activo", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("puede_reservar_extra", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint("cedula", name="uq_usuario_cedula"),
    )
    op.create_index("ix_usuario_cedula", "usuarios", ["cedula"])

    op.create_table(
        "areas",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("nombre", sa.String(120), nullable=False),
        sa.Column("descripcion", sa.String(255)),
        sa.Column("activo", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.UniqueConstraint("nombre", name="uq_area_nombre"),
    )
    op.create_index("ix_area_nombre", "areas", ["nombre"])

    op.create_table(
        "servicios",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("nombre", sa.String(120), nullable=False),
        sa.Column("descripcion", sa.String(255)),
        sa.Column("activo", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.UniqueConstraint("nombre", name="uq_servicio_nombre"),
    )
    op.create_index("ix_servicio_nombre", "servicios", ["nombre"])

    op.create_table(
        "agendas",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("nombre", sa.String(140), nullable=False),
        sa.Column("area_id", sa.Integer, sa.ForeignKey("areas.id"), nullable=False),
        sa.Column("servicio_id", sa.Integer, sa.ForeignKey("servicios.id"), nullable=False),
        sa.Column("hora_inicio", sa.Time, nullable=False),
        sa.Column("hora_fin", sa.Time, nullable=False),
        sa.Column("almuerzo_inicio", sa.Time),
        sa.Column("almuerzo_fin", sa.Time),
        sa.Column("duracion_min", sa.Integer, nullable=False, server_default="30"),
        sa.Column("dias_habilitados", sa.String(20), nullable=False, server_default="0,1,2,3,4"),
        sa.Column("estado", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.UniqueConstraint("area_id", "servicio_id", name="uq_agenda_area_servicio"),
    )
    op.create_index("ix_agenda_area", "agendas", ["area_id"])
    op.create_index("ix_agenda_servicio", "agendas", ["servicio_id"])

    op.create_table(
        "reservas",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("agenda_id", sa.Integer, sa.ForeignKey("agendas.id"), nullable=False),
        sa.Column("usuario_id", sa.Integer, sa.ForeignKey("usuarios.id"), nullable=False),
        sa.Column("fecha", sa.Date, nullable=False),
        sa.Column("hora_inicio", sa.Time, nullable=False),
        sa.Column("hora_fin", sa.Time, nullable=False),
        sa.Column("estado", sa.String(20), nullable=False, server_default="activa"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("cancelada_por", sa.String(80)),
    )
    op.create_index("ix_reserva_agenda", "reservas", ["agenda_id"])
    op.create_index("ix_reserva_usuario", "reservas", ["usuario_id"])
    op.create_index("ix_reserva_fecha", "reservas", ["fecha"])
    op.create_index("ix_reserva_estado", "reservas", ["estado"])
    # Índice único PARCIAL: impide doble reserva del mismo slot solo para estado 'activa'.
    op.create_index(
        "uq_reserva_activa_slot",
        "reservas",
        ["agenda_id", "fecha", "hora_inicio"],
        unique=True,
        postgresql_where=sa.text("estado = 'activa'"),
    )

    op.create_table(
        "bloqueos",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("agenda_id", sa.Integer, sa.ForeignKey("agendas.id")),
        sa.Column("tipo", sa.String(10), nullable=False),
        sa.Column("fecha", sa.Date, nullable=False),
        sa.Column("hora_inicio", sa.Time),
        sa.Column("hora_fin", sa.Time),
        sa.Column("motivo", sa.String(255)),
    )
    op.create_index("ix_bloqueo_agenda", "bloqueos", ["agenda_id"])
    op.create_index("ix_bloqueo_fecha", "bloqueos", ["fecha"])

    op.create_table(
        "festivos",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("fecha", sa.Date, nullable=False),
        sa.Column("descripcion", sa.String(160)),
        sa.UniqueConstraint("fecha", name="uq_festivo_fecha"),
    )
    op.create_index("ix_festivo_fecha", "festivos", ["fecha"])

    op.create_table(
        "auditoria",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("actor", sa.String(80), nullable=False),
        sa.Column("accion", sa.String(80), nullable=False),
        sa.Column("entidad", sa.String(60)),
        sa.Column("entidad_id", sa.Integer),
        sa.Column("detalle", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_auditoria_actor", "auditoria", ["actor"])

    op.create_table(
        "configuracion_general",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("clave", sa.String(80), nullable=False),
        sa.Column("valor", sa.Text),
        sa.UniqueConstraint("clave", name="uq_config_clave"),
    )
    op.create_index("ix_config_clave", "configuracion_general", ["clave"])


def downgrade() -> None:
    op.drop_table("configuracion_general")
    op.drop_table("auditoria")
    op.drop_table("festivos")
    op.drop_table("bloqueos")
    op.drop_index("uq_reserva_activa_slot", table_name="reservas")
    op.drop_table("reservas")
    op.drop_table("agendas")
    op.drop_table("servicios")
    op.drop_table("areas")
    op.drop_table("usuarios")
    op.drop_table("administrador")
