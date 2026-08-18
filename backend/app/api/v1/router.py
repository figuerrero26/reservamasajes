from fastapi import APIRouter

from app.api.v1 import (
    administradores, agendas, areas, auditoria, auth, bloqueos, configuracion, cuenta, eventos,
    festivos, reservas, semana, servicios, usuarios,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(administradores.router)
api_router.include_router(cuenta.router)
api_router.include_router(eventos.router)
api_router.include_router(areas.router)
api_router.include_router(servicios.router)
api_router.include_router(agendas.router)
api_router.include_router(reservas.router)
api_router.include_router(usuarios.router)
api_router.include_router(bloqueos.router)
api_router.include_router(festivos.router)
api_router.include_router(configuracion.router)
api_router.include_router(semana.router)
api_router.include_router(auditoria.router)
