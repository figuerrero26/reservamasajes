"""Punto de entrada de la API — Sistema de Reservas de Bienestar."""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.v1.router import api_router
from app.config import settings
from app.services.errors import DomainError
from app.utils.limiter import limiter

app = FastAPI(
    title="Reservas de Bienestar",
    version="2.0.0",
    description="API para la gestión de reservas de actividades de bienestar.",
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
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})


@app.get("/health", tags=["infra"])
def health():
    return {"status": "ok", "timezone": settings.APP_TIMEZONE}


app.include_router(api_router, prefix="/api/v1")
