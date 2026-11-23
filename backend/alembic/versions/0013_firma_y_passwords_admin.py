"""Firma InfraestructurEF y fecha de la contraseña vigente de cada administrador.

Cambio de estructura (100 % aditivo):
- `administradores.password_actualizada_en` (DATETIME, NULL): cuándo se fijó la contraseña
  vigente (alta, cambio propio o restablecimiento por otro administrador). Las cuentas
  existentes quedan en NULL ("sin registro") hasta su próximo cambio. Nunca se guarda la
  contraseña: solo su hash Bcrypt, como hasta ahora.

Cambio de datos (solo la firma de la plataforma):
- La identidad `empresa_nombre` pasa de "SIGRA S.A.S" (con o sin puntos, mayúsculas o
  espacios) —o vacía— a "InfraestructurEF". Cualquier otro valor que el administrador haya
  escrito se respeta. Si la clave no existe, se crea. Los datos de contacto, el título del
  portal y el logo NO se tocan.

Antes de aplicar la migración el entrypoint genera un respaldo completo de la base
(scripts/respaldo_pre_migracion.py). El downgrade elimina la columna y devuelve la firma a
"SIGRA S.A.S" solo si sigue siendo "InfraestructurEF".

Revision ID: 0013
Revises: 0012
Create Date: 2026-11-23
"""
from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa

revision: str = "0013"
down_revision: Union[str, None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

FIRMA_NUEVA = "InfraestructurEF"
FIRMA_ANTERIOR = "SIGRA S.A.S"

# SQL portable (MariaDB y SQLite): la suite de pruebas ejecuta estas mismas sentencias.
_VALOR_NORMALIZADO = "UPPER(REPLACE(REPLACE(REPLACE(TRIM(valor), '.', ''), ' ', ''), ',', ''))"
SENTENCIA_FIRMA = (
    f"UPDATE configuracion_general SET valor = '{FIRMA_NUEVA}' "
    f"WHERE clave = 'empresa_nombre' AND (valor IS NULL OR TRIM(valor) = '' "
    f"OR {_VALOR_NORMALIZADO} IN ('SIGRASAS', 'SIGRA'))"
)


def aplicar_firma(conn) -> None:
    """Actualiza la firma (o la crea si la clave no existe). Reutilizada por las pruebas."""
    conn.execute(sa.text(SENTENCIA_FIRMA))
    existe = conn.execute(
        sa.text("SELECT COUNT(*) FROM configuracion_general WHERE clave = 'empresa_nombre'")
    ).scalar()
    if not existe:
        conn.execute(
            sa.text("INSERT INTO configuracion_general (clave, valor) VALUES ('empresa_nombre', :valor)"),
            {"valor": FIRMA_NUEVA},
        )


def upgrade() -> None:
    op.add_column("administradores", sa.Column("password_actualizada_en", sa.DateTime(), nullable=True))
    if context.is_offline_mode():
        # Generación de SQL sin conexión (`alembic upgrade --sql`): mismas reglas en SQL puro.
        op.execute(SENTENCIA_FIRMA)
        op.execute(
            f"INSERT INTO configuracion_general (clave, valor) SELECT 'empresa_nombre', '{FIRMA_NUEVA}' FROM DUAL "
            "WHERE NOT EXISTS (SELECT 1 FROM configuracion_general WHERE clave = 'empresa_nombre')"
        )
    else:
        aplicar_firma(op.get_bind())


def downgrade() -> None:
    # Literales (constantes de este archivo) para que también funcione al generar SQL offline.
    op.execute(
        f"UPDATE configuracion_general SET valor = '{FIRMA_ANTERIOR}' "
        f"WHERE clave = 'empresa_nombre' AND valor = '{FIRMA_NUEVA}'"
    )
    op.drop_column("administradores", "password_actualizada_en")
