"""Tareas programadas del backend (corren solas, sin que nadie entre al panel).

1. Fin de vigencia de los eventos. La disponibilidad NO depende de esta tarea: cada solicitud
   compara la fecha actual con la vigencia del evento (app/utils/vigencia.py), así que un
   evento deja de recibir reservas o inscripciones a la medianoche del día siguiente a su fin
   aunque la tarea no haya corrido. Lo que hace la tarea es REGISTRAR ese cierre: marca
   `finalizado_en` y deja una entrada de auditoría "finalizar_por_vigencia" con cuántas
   reservas o inscripciones conserva el evento. No modifica, cancela ni elimina ninguna
   reserva, inscripción ni notificación, ni toca el flag `activo` del evento.
2. Limpieza de imágenes de eventos que ya ningún evento usa (ver imagen_service).

Se ejecuta al arrancar la API y luego cada `INTERVALO_TAREAS_SEGUNDOS` (app/main.py). Es
segura ante varias instancias a la vez: cada evento se marca con un UPDATE condicionado a
que `finalizado_en` siga vacío, y solo quien lo marca registra la auditoría.
"""
import asyncio
import logging

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.database.session import SessionLocal
from app.models import Actividad, EstadoReserva, Servicio
from app.repositories.inscripcion_repository import InscripcionRepository
from app.repositories.reserva_repository import ReservaRepository
from app.services import auditoria_service
from app.services.imagen_service import limpiar_imagenes_huerfanas
from app.utils.time import now, today

logger = logging.getLogger("reservas")


def registrar_finalizaciones(db: Session, hoy=None) -> list[tuple[str, int]]:
    """Marca como finalizados los eventos cuya vigencia ya terminó y que todavía no estaban
    marcados. Devuelve (entidad, id) de cada uno."""
    hoy = hoy or today()
    momento = now().replace(tzinfo=None)  # DATETIME sin zona, en hora local de la aplicación
    marcados: list[tuple[str, int]] = []
    for modelo, entidad in ((Servicio, "servicio"), (Actividad, "actividad")):
        candidatos = db.execute(
            select(modelo.id, modelo.vigencia_fin).where(
                modelo.vigencia_fin.is_not(None), modelo.vigencia_fin < hoy, modelo.finalizado_en.is_(None),
            )
        ).all()
        for evento_id, fin in candidatos:
            resultado = db.execute(
                update(modelo)
                .where(modelo.id == evento_id, modelo.finalizado_en.is_(None))
                # `updated_at` se deja igual: refleja la última edición del administrador.
                .values(finalizado_en=momento, updated_at=modelo.updated_at)
            )
            if resultado.rowcount != 1:
                continue  # otra instancia lo marcó primero
            if entidad == "servicio":
                conteo = ReservaRepository(db).contar_por_estado(evento_id)
                conservadas = {"reservas_por_estado": conteo,
                               "reservas_activas": conteo.get(EstadoReserva.ACTIVA.value, 0)}
            else:
                conservadas = {"inscripciones_por_estado": InscripcionRepository(db).contar_por_estado(evento_id)}
            auditoria_service.registrar(
                db, None, "finalizar_por_vigencia", entidad, evento_id,
                datos_nuevos={"vigencia_fin": fin.isoformat(), "finalizado_en": momento.isoformat(), **conservadas},
            )
            marcados.append((entidad, evento_id))
    db.commit()
    if marcados:
        logger.info("Eventos finalizados por vigencia: %s", marcados)
    return marcados


def ejecutar_tareas() -> None:
    """Una pasada completa; cada tarea es independiente (si una falla, la otra corre)."""
    for tarea in (registrar_finalizaciones, limpiar_imagenes_huerfanas):
        db = SessionLocal()
        try:
            tarea(db)
        except Exception:  # noqa: BLE001 — una falla no debe detener el bucle ni la API
            db.rollback()
            logger.exception("Falló la tarea programada %s", tarea.__name__)
        finally:
            db.close()


async def bucle_tareas(intervalo_seg: int, espera_inicial_seg: float = 5) -> None:
    """Corre `ejecutar_tareas` en un hilo aparte (no bloquea las solicitudes) al arrancar y
    luego cada `intervalo_seg`."""
    await asyncio.sleep(espera_inicial_seg)
    while True:
        await asyncio.to_thread(ejecutar_tareas)
        await asyncio.sleep(max(60, intervalo_seg))
