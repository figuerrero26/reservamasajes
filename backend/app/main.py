"""Punto de entrada de la API — Sistema de Reservas de Bienestar."""
import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from sqlalchemy.exc import IntegrityError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.v1.router import api_router
from app.config import settings
from app.services.errors import DomainError
from app.services.tareas_programadas import bucle_tareas
from app.utils.limiter import limiter
from app.utils.uploads import PUBLIC_PREFIX, UPLOAD_DIR

logger = logging.getLogger("reservas")


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Arranca las tareas programadas (registro del fin de vigencia de los eventos y limpieza
    de imágenes sin uso, ver app/services/tareas_programadas.py) y las detiene al apagar."""
    tarea = asyncio.create_task(bucle_tareas(settings.INTERVALO_TAREAS_SEGUNDOS)) if settings.TAREAS_PROGRAMADAS else None
    try:
        yield
    finally:
        if tarea:
            tarea.cancel()
            with suppress(asyncio.CancelledError):
                await tarea


app = FastAPI(
    title="Reservas de Bienestar",
    version="2.0.0",
    description="API para la gestión de reservas de actividades de bienestar.",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(DomainError)
async def domain_error_handler(_: Request, exc: DomainError):
    contenido = {"detail": exc.message}
    if exc.datos:
        contenido.update(jsonable_encoder(exc.datos))
    return JSONResponse(status_code=exc.status_code, content=contenido)


@app.exception_handler(IntegrityError)
async def integrity_error_handler(_: Request, exc: IntegrityError):
    """Última barrera: un choque con una restricción única que no se validó antes (p. ej.
    dos administradores guardando el mismo nombre a la vez) responde 409 legible en vez de
    un 500 genérico."""
    logger.warning("IntegrityError no controlado: %s", exc.orig)
    return JSONResponse(
        status_code=409,
        content={"detail": "La operación entra en conflicto con datos existentes (registro duplicado o en uso)."},
    )


@app.get("/health", tags=["infra"])
def health():
    return {"status": "ok", "timezone": settings.APP_TIMEZONE}


app.include_router(api_router, prefix="/api/v1")

# Imágenes subidas desde el panel (ver app/utils/uploads.py). Servidas bajo /api/ para que
# el proxy inverso del frontend (nginx, location /api/) las alcance sin configuración aparte.
app.mount(PUBLIC_PREFIX, StaticFiles(directory=UPLOAD_DIR), name="uploads")
