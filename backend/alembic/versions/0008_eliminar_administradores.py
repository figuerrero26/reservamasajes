"""Permite eliminar (borrar de verdad) una cuenta de administrador desde el panel.

Las columnas `bloqueos.creado_por`, `auditoria.admin_id` y `configuracion_smtp.actualizado_por`
ya eran NULLABLE, pero sus llaves foráneas tenían DELETE_RULE=RESTRICT (el valor por defecto
de MariaDB cuando no se especifica ON DELETE). Con eso, borrar un administrador fallaba en la
práctica para cualquiera que hubiera iniciado sesión al menos una vez, porque el login ya
queda en `auditoria`. Se cambia a ON DELETE SET NULL: el registro/bloqueo/configuración
sobrevive, solo pierde el enlace a quién lo hizo.

Revision ID: 0008
Revises: 0007
Create Date: 2026-08-14
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("bloqueos_ibfk_2", "bloqueos", type_="foreignkey")
    op.create_foreign_key(
        "fk_bloqueo_administrador", "bloqueos", "administradores", ["creado_por"], ["id"],
        ondelete="SET NULL",
    )

    op.drop_constraint("auditoria_ibfk_1", "auditoria", type_="foreignkey")
    op.create_foreign_key(
        "fk_auditoria_administrador", "auditoria", "administradores", ["admin_id"], ["id"],
        ondelete="SET NULL",
    )

    op.drop_constraint("configuracion_smtp_ibfk_1", "configuracion_smtp", type_="foreignkey")
    op.create_foreign_key(
        "fk_configuracion_smtp_administrador", "configuracion_smtp", "administradores",
        ["actualizado_por"], ["id"], ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_configuracion_smtp_administrador", "configuracion_smtp", type_="foreignkey")
    op.create_foreign_key(
        "configuracion_smtp_ibfk_1", "configuracion_smtp", "administradores", ["actualizado_por"], ["id"],
    )

    op.drop_constraint("fk_auditoria_administrador", "auditoria", type_="foreignkey")
    op.create_foreign_key(
        "auditoria_ibfk_1", "auditoria", "administradores", ["admin_id"], ["id"],
    )

    op.drop_constraint("fk_bloqueo_administrador", "bloqueos", type_="foreignkey")
    op.create_foreign_key(
        "bloqueos_ibfk_2", "bloqueos", "administradores", ["creado_por"], ["id"],
    )
