from fastapi import APIRouter

from app.api.v1 import auth, areas, servicios, agendas, reservas

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(areas.router)
api_router.include_router(servicios.router)
api_router.include_router(agendas.router)
api_router.include_router(reservas.router)
