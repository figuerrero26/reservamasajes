"""Permite eliminar (borrar de verdad, no solo bloquear) una cuenta de colaborador desde el
panel, sin perder el historial de sus reservas ya pasadas.

`reservas.usuario_id` y `notificaciones.usuario_id` pasan a ser NULLABLE con
ON DELETE SET NULL: al eliminar un `usuarios`, las filas que lo referencian no se borran ni
fallan por integridad referencial, solo pierden el enlace. Para que el historial siga siendo
legible después de eso, `reservas` gana una foto de la identidad (`usuario_nombre`,
`usuario_apellido`, `usuario_correo`) tomada al crear la reserva — se backfillea aquí para
las filas existentes. `notificaciones.destinatario` ya guardaba el correo por separado, así
que no necesita una foto nueva.

La cancelación de las reservas futuras/activas del usuario (a diferencia de las que ya
pasaron, que se dejan intactas) la hace UsuarioService.eliminar en Python antes del DELETE,
no esta migración.

Revision ID: 0007
Revises: 0006
Create Date: 2026-08-14
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("reservas", sa.Column("usuario_nombre", sa.String(120), nullable=True))
    op.add_column("reservas", sa.Column("usuario_apellido", sa.String(120), nullable=True))
    op.add_column("reservas", sa.Column("usuario_correo", sa.String(160), nullable=True))
    op.execute(
        "UPDATE reservas r JOIN usuarios u ON r.usuario_id = u.id "
        "SET r.usuario_nombre = u.nombre, r.usuario_apellido = u.apellido, r.usuario_correo = u.correo"
    )
    op.alter_column("reservas", "usuario_nombre", existing_type=sa.String(120), nullable=False)
    op.alter_column(
        "reservas", "usuario_apellido", existing_type=sa.String(120), nullable=False,
        server_default="",
    )

    op.drop_constraint("reservas_ibfk_2", "reservas", type_="foreignkey")
    op.alter_column("reservas", "usuario_id", existing_type=sa.Integer, nullable=True)
    op.create_foreign_key(
        "fk_reserva_usuario", "reservas", "usuarios", ["usuario_id"], ["id"], ondelete="SET NULL",
    )

    op.drop_constraint("notificaciones_ibfk_2", "notificaciones", type_="foreignkey")
    op.alter_column("notificaciones", "usuario_id", existing_type=sa.Integer, nullable=True)
    op.create_foreign_key(
        "fk_notificacion_usuario", "notificaciones", "usuarios", ["usuario_id"], ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_notificacion_usuario", "notificaciones", type_="foreignkey")
    op.alter_column("notificaciones", "usuario_id", existing_type=sa.Integer, nullable=False)
    op.create_foreign_key(
        "notificaciones_ibfk_2", "notificaciones", "usuarios", ["usuario_id"], ["id"],
    )

    op.drop_constraint("fk_reserva_usuario", "reservas", type_="foreignkey")
    op.alter_column("reservas", "usuario_id", existing_type=sa.Integer, nullable=False)
    op.create_foreign_key(
        "reservas_ibfk_2", "reservas", "usuarios", ["usuario_id"], ["id"],
    )

    op.drop_column("reservas", "usuario_correo")
    op.drop_column("reservas", "usuario_apellido")
    op.drop_column("reservas", "usuario_nombre")
