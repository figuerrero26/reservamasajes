"""Cuentas de usuario (registro/login), eventos con tarjeta, SMTP y notificaciones

Revision ID: 0002
Revises: 0001
Create Date: 2026-08-14
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- usuarios: nombre_completo -> nombre + apellido, + cuenta (correo único + password) ---
    op.add_column("usuarios", sa.Column("nombre", sa.String(120), nullable=True))
    op.add_column("usuarios", sa.Column("apellido", sa.String(120), nullable=True))
    op.add_column("usuarios", sa.Column("password_hash", sa.String(255), nullable=True))
    op.execute("UPDATE usuarios SET nombre = nombre_completo, apellido = ''")
    op.alter_column("usuarios", "nombre", existing_type=sa.String(120), nullable=False)
    op.alter_column(
        "usuarios", "apellido", existing_type=sa.String(120), nullable=False, server_default=""
    )
    op.drop_column("usuarios", "nombre_completo")
    op.create_unique_constraint("uq_usuario_correo", "usuarios", ["correo"])

    # --- servicios (Evento): campos de tarjeta ---
    op.alter_column(
        "servicios", "descripcion", new_column_name="descripcion_corta",
        existing_type=sa.String(255),
    )
    op.add_column("servicios", sa.Column("descripcion_larga", sa.Text(), nullable=True))
    op.add_column("servicios", sa.Column("imagen_url", sa.String(500), nullable=True))
    op.add_column(
        "servicios", sa.Column("duracion_minutos", sa.Integer(), nullable=False, server_default="30")
    )
    op.add_column("servicios", sa.Column("informacion_adicional", sa.Text(), nullable=True))

    # --- notificaciones (correos enviados/intentados) ---
    op.create_table(
        "notificaciones",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("reserva_id", sa.Integer, sa.ForeignKey("reservas.id"), nullable=True),
        sa.Column("usuario_id", sa.Integer, sa.ForeignKey("usuarios.id"), nullable=False),
        sa.Column("tipo", sa.String(40), nullable=False, server_default="confirmacion"),
        sa.Column("destinatario", sa.String(160), nullable=False),
        sa.Column("estado", sa.String(20), nullable=False, server_default="pendiente"),
        sa.Column("intentos", sa.Integer, nullable=False, server_default="0"),
        sa.Column("error_mensaje", sa.Text),
        sa.Column("enviado_en", sa.DateTime),
        sa.Column("created_at", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_notificacion_reserva", "notificaciones", ["reserva_id"])
    op.create_index("ix_notificacion_usuario", "notificaciones", ["usuario_id"])
    op.create_index("ix_notificacion_estado", "notificaciones", ["estado"])

    # --- configuracion_smtp (fila única, editable desde el panel) ---
    op.create_table(
        "configuracion_smtp",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("host", sa.String(255)),
        sa.Column("port", sa.Integer),
        sa.Column("usuario", sa.String(255)),
        sa.Column("password_cifrado", sa.Text),
        sa.Column("tls", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("from_email", sa.String(255)),
        sa.Column("from_nombre", sa.String(160)),
        sa.Column("actualizado_por", sa.Integer, sa.ForeignKey("administradores.id")),
        sa.Column("updated_at", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP")),
    )


def downgrade() -> None:
    op.drop_table("configuracion_smtp")
    op.drop_index("ix_notificacion_estado", table_name="notificaciones")
    op.drop_index("ix_notificacion_usuario", table_name="notificaciones")
    op.drop_index("ix_notificacion_reserva", table_name="notificaciones")
    op.drop_table("notificaciones")

    op.drop_column("servicios", "informacion_adicional")
    op.drop_column("servicios", "duracion_minutos")
    op.drop_column("servicios", "imagen_url")
    op.add_column("servicios", sa.Column("descripcion", sa.String(255), nullable=True))
    op.execute("UPDATE servicios SET descripcion = descripcion_corta")
    op.drop_column("servicios", "descripcion_corta")
    op.drop_column("servicios", "descripcion_larga")

    op.drop_constraint("uq_usuario_correo", "usuarios", type_="unique")
    op.add_column("usuarios", sa.Column("nombre_completo", sa.String(160), nullable=True))
    op.execute("UPDATE usuarios SET nombre_completo = TRIM(CONCAT(nombre, ' ', apellido))")
    op.alter_column("usuarios", "nombre_completo", existing_type=sa.String(160), nullable=False)
    op.drop_column("usuarios", "password_hash")
    op.drop_column("usuarios", "apellido")
    op.drop_column("usuarios", "nombre")
