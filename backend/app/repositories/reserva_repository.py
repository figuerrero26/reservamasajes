from datetime import date

from sqlalchemy import select, or_
from sqlalchemy.orm import Session, joinedload

from app.models import Agenda, Reserva, EstadoReserva
from app.repositories.base import BaseRepository


class ReservaRepository(BaseRepository[Reserva]):
    def __init__(self, db: Session):
        super().__init__(Reserva, db)

    def activas_por_usuario(self, usuario_id: int) -> list[Reserva]:
        return list(
            self.db.execute(
                select(Reserva).where(
                    Reserva.usuario_id == usuario_id,
                    Reserva.estado == EstadoReserva.ACTIVA.value,
                )
            ).scalars().all()
        )

    def activa_por_usuario_evento_fecha(self, usuario_id: int, servicio_id: int, fecha: date) -> Reserva | None:
        """Solo para el mensaje de error amigable antes de tocar la BD (ver ReservaService).
        Usa `.first()` y no `.scalar_one_or_none()` a propósito: con la excepción
        `permite_reservas_multiples` puede haber más de una fila activa para la misma
        combinación usuario+evento+día, y aquí solo interesa saber si existe al menos una."""
        return self.db.execute(
            select(Reserva).where(
                Reserva.usuario_id == usuario_id,
                Reserva.servicio_id == servicio_id,
                Reserva.fecha == fecha,
                Reserva.estado == EstadoReserva.ACTIVA.value,
            )
        ).scalars().first()

    def activa_por_usuario_evento_rango(
        self, usuario_id: int, servicio_id: int, fecha_inicio: date, fecha_fin: date,
    ) -> Reserva | None:
        """Como `activa_por_usuario_evento_fecha`, pero para la regla opcional
        `evento_unico_por_semana`: busca en todo el rango [fecha_inicio, fecha_fin], no solo
        un día exacto (ver ReservaService)."""
        return self.db.execute(
            select(Reserva).where(
                Reserva.usuario_id == usuario_id,
                Reserva.servicio_id == servicio_id,
                Reserva.fecha >= fecha_inicio,
                Reserva.fecha <= fecha_fin,
                Reserva.estado == EstadoReserva.ACTIVA.value,
            )
        ).scalars().first()

    def activas_por_agenda_fecha(self, agenda_id: int, fecha: date) -> list[Reserva]:
        return list(
            self.db.execute(
                select(Reserva).where(
                    Reserva.agenda_id == agenda_id,
                    Reserva.fecha == fecha,
                    Reserva.estado == EstadoReserva.ACTIVA.value,
                )
            ).scalars().all()
        )

    def no_canceladas_por_agenda_fecha(self, agenda_id: int, fecha: date) -> list[Reserva]:
        """Como `activas_por_agenda_fecha`, pero incluye también `completada`/`no_asistio`:
        para la vista "por día" del panel (ver ReservaService.dia), donde una reserva ya
        pasada debe seguir mostrando quién ocupó el turno y con qué resultado, aunque ya no
        esté "activa". Las canceladas sí se excluyen: su turno vuelve a quedar libre."""
        return list(
            self.db.execute(
                select(Reserva).where(
                    Reserva.agenda_id == agenda_id,
                    Reserva.fecha == fecha,
                    Reserva.estado != EstadoReserva.CANCELADA.value,
                )
            ).scalars().all()
        )

    def buscar(self, nombre: str | None = None, correo: str | None = None,
               fecha: date | None = None, agenda_id: int | None = None,
               servicio_id: int | None = None, estado: str | None = None) -> list[Reserva]:
        """Búsqueda administrativa por nombre/correo/fecha/agenda/evento (uso interno, no
        público). Filtra nombre/correo contra la foto tomada en la propia reserva
        (`Reserva.usuario_nombre`/`usuario_correo`, no un join a `usuarios`) para que las
        reservas de una cuenta ya eliminada sigan apareciendo y siendo buscables. Carga
        adelantada de servicio/agenda+área: el panel muestra quién reservó qué sin disparar
        una consulta por fila."""
        stmt = select(Reserva).options(
            joinedload(Reserva.servicio),
            joinedload(Reserva.agenda).joinedload(Agenda.area),
        )
        if servicio_id:
            stmt = stmt.where(Reserva.servicio_id == servicio_id)
        if estado:
            stmt = stmt.where(Reserva.estado == estado)
        if nombre:
            stmt = stmt.where(
                or_(Reserva.usuario_nombre.icontains(nombre), Reserva.usuario_apellido.icontains(nombre))
            )
        if correo:
            stmt = stmt.where(Reserva.usuario_correo.icontains(correo))
        if fecha:
            stmt = stmt.where(Reserva.fecha == fecha)
        if agenda_id:
            stmt = stmt.where(Reserva.agenda_id == agenda_id)
        stmt = stmt.order_by(Reserva.fecha.desc(), Reserva.hora_inicio.desc())
        return list(self.db.execute(stmt).scalars().all())

    def mias(self, usuario_id: int) -> list[Reserva]:
        """Reservas propias de un usuario autenticado (histórico completo, todos los estados)."""
        return list(
            self.db.execute(
                select(Reserva)
                .where(Reserva.usuario_id == usuario_id)
                .order_by(Reserva.fecha.desc(), Reserva.hora_inicio.desc())
            ).scalars().all()
        )
