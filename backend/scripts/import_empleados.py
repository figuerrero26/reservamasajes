"""Importación de empleados desde Excel con reglas de validación (§12).

Uso: python -m scripts.import_empleados <ruta_archivo.xlsx>

- Columnas requeridas: cedula, nombre_completo
- Columnas opcionales: area, cargo, correo
- Detecta formato inválido, cédulas duplicadas y filas con errores.
- Actualiza usuarios existentes sin afectar reservas (RF-17). Presenta un reporte.
"""
import sys

import pandas as pd

from app.database.session import SessionLocal
from app.repositories.usuario_repository import UsuarioRepository
from app.models import Usuario

REQUERIDAS = {"cedula", "nombre_completo"}
OPCIONALES = {"area", "cargo", "correo"}


def importar(ruta: str) -> dict:
    reporte = {"insertados": 0, "actualizados": 0, "rechazados": [], "duplicados_archivo": []}
    try:
        df = pd.read_excel(ruta, dtype=str)
    except Exception as exc:  # formato inválido
        return {"error": f"No se pudo leer el archivo: {exc}"}

    df.columns = [c.strip().lower() for c in df.columns]
    faltantes = REQUERIDAS - set(df.columns)
    if faltantes:
        return {"error": f"Faltan columnas requeridas: {', '.join(sorted(faltantes))}"}

    vistos: set[str] = set()
    db = SessionLocal()
    repo = UsuarioRepository(db)
    try:
        for idx, row in df.iterrows():
            fila = idx + 2  # +2 por encabezado y base 1
            cedula = (row.get("cedula") or "").strip()
            nombre = (row.get("nombre_completo") or "").strip()

            if not cedula or not nombre:
                reporte["rechazados"].append({"fila": fila, "motivo": "cédula o nombre vacío"})
                continue
            if cedula in vistos:
                reporte["duplicados_archivo"].append({"fila": fila, "cedula": cedula})
                continue
            vistos.add(cedula)

            existente = repo.by_cedula(cedula)
            campos = dict(
                nombre_completo=nombre,
                area=(row.get("area") or None),
                cargo=(row.get("cargo") or None),
                correo=(row.get("correo") or None),
            )
            if existente:  # actualiza sin tocar reservas (RF-17)
                for k, v in campos.items():
                    setattr(existente, k, v)
                existente.activo = True
                reporte["actualizados"] += 1
            else:
                repo.add(Usuario(cedula=cedula, **campos))
                reporte["insertados"] += 1

        db.commit()
    finally:
        db.close()
    return reporte


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python -m scripts.import_empleados <archivo.xlsx>")
        sys.exit(1)
    resultado = importar(sys.argv[1])
    print(resultado)
