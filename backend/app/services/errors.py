"""Errores de dominio, traducidos a respuestas HTTP en la capa API (ver app/main.py).

`datos` es opcional y viaja junto a `detail` en la respuesta JSON: permite que el frontend
muestre información estructurada además del mensaje (p. ej. la lista de reservas que
impiden modificar una agenda).
"""
from typing import Any


class DomainError(Exception):
    def __init__(self, message: str, status_code: int = 400, datos: dict[str, Any] | None = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.datos = datos


class NotFound(DomainError):
    def __init__(self, message: str = "Recurso no encontrado"):
        super().__init__(message, status_code=404)


class Conflict(DomainError):
    def __init__(self, message: str = "Conflicto de datos", datos: dict[str, Any] | None = None):
        super().__init__(message, status_code=409, datos=datos)


class Forbidden(DomainError):
    def __init__(self, message: str = "No tiene permisos para esta acción"):
        super().__init__(message, status_code=403)
