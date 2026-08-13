"""Errores de dominio, traducidos a respuestas HTTP en la capa API."""


class DomainError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class NotFound(DomainError):
    def __init__(self, message: str = "Recurso no encontrado"):
        super().__init__(message, status_code=404)


class Conflict(DomainError):
    def __init__(self, message: str = "Conflicto de datos"):
        super().__init__(message, status_code=409)


class Forbidden(DomainError):
    def __init__(self, message: str = "No tiene permisos para esta acción"):
        super().__init__(message, status_code=403)
