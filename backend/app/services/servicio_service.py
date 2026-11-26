"""Servicios (mostrados al público como "Eventos" de reserva por turnos).

Relación con las áreas: un evento por turnos pertenece a una o varias áreas A TRAVÉS de sus
agendas (agenda = evento + área + horario). No hay una columna de área en el servicio a
propósito: duplicaría lo que ya registra cada agenda y podría contradecirla. Por eso un
evento se crea siempre junto con su área y su primera agenda (ver `crear`).

Regla de desactivación (coherente en todos los módulos):
- Un servicio inactivo NO aparece en el catálogo, sus agendas dejan de ofrecer turnos y no
  se pueden crear reservas nuevas (ni públicas ni manuales) — validado en el backend por
  `horario_service.motivo_no_reservable`, no solo ocultándolo en el frontend.
- Las reservas futuras que ya existían se CONSERVAN: la desactivación responde la lista para
  que el administrador decida si se atienden o si las cancela con notificación.
- El flag `activo` de cada agenda no se toca: al reactivar el servicio, vuelven a estar
  disponibles exactamente las agendas que estaban activas antes.

Vigencia (ver app/utils/vigencia.py): la misma regla aplica automáticamente fuera del
periodo del evento — antes del inicio ("próximo") y después del fin ("finalizado") no se
publica ni recibe reservas, sin tocar el flag `activo` ni ninguna reserva existente.
"""
from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.models import Agenda, Bloqueo, Notificacion, Reserva, Servicio
from app.repositories.agenda_repository import AgendaRepository
from app.repositories.area_repository import AreaRepository
from app.repositories.reserva_repository import ReservaRepository
from app.repositories.servicio_repository import ServicioRepository
from app.schemas.evento import AgendaResumen, EventoPublico
from app.schemas.servicio import ServicioCreate, ServicioUpdate, describir_regla_reserva
from app.schemas.vigencia import HorarioParticipacion, validar_horario_participacion, validar_rango_vigencia
from app.services import auditoria_service
from app.services.auditoria_service import snapshot
from app.services.errors import Conflict, DomainError, NotFound
from app.services.horario_service import HorarioService, ResumenTurnos
from app.services.reserva_service import a_admin_out
from app.utils.time import now, today
from app.utils.vigencia import estado_participacion, estado_vigencia, motivo_participacion, proximo_cambio_participacion

CAMPOS = [
    "id", "nombre", "descripcion_corta", "descripcion_larga", "imagen_url",
    "duracion_minutos", "informacion_adicional", "activo",
    "vigencia_inicio", "vigencia_fin", "limite_participaciones", "periodo_limite",
    "publicacion_en", "hora_apertura", "hora_cierre",
]
CAMPOS_AGENDA = [
    "id", "nombre", "area_id", "servicio_id", "hora_inicio", "hora_fin",
    "almuerzo_inicio", "almuerzo_fin", "duracion_minutos", "dias_habilitados", "activo",
]
NO_NULOS = {"nombre", "activo", "vigencia_inicio", "vigencia_fin", "periodo_limite"}


def normalizar_regla_reserva(limite: int | None, periodo: str) -> tuple[int, str]:
    """En los eventos por turnos siempre rige una reserva por persona por día: "sin límite
    adicional" equivale a esa regla, y un límite diario mayor que 1 no es posible."""
    if limite is None:
        return 1, "dia"
    if periodo == "dia" and limite > 1:
        raise DomainError(
            "En los eventos por turnos cada persona puede tener como máximo una reserva por día. "
            "Para permitir varias, usa un periodo semanal, mensual o de toda la vigencia."
        )
    return limite, periodo


def validar_vigencia(inicio, fin) -> None:
    if inicio is None or fin is None:
        raise DomainError("Define la fecha de inicio y la de finalización del evento.")
    try:
        validar_rango_vigencia(inicio, fin)
    except ValueError as exc:
        raise DomainError(str(exc)) from exc


class ServicioService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = ServicioRepository(db)
        self.agendas = AgendaRepository(db)
        self.areas = AreaRepository(db)
        self.reservas = ReservaRepository(db)

    def listar(self, area_id: int | None = None, estado: str | None = None) -> list[Servicio]:
        """Vista administrativa. `estado` filtra por vigencia: vigente, proximo, finalizado o
        sin_vigencia (eventos antiguos que todavía no tienen fechas)."""
        servicios = self.repo.listar(area_id=area_id)
        if estado:
            hoy = today()
            servicios = [s for s in servicios if estado_vigencia(s.vigencia_inicio, s.vigencia_fin, hoy) == estado]
        return servicios

    def listar_eventos_publicos(self) -> list[EventoPublico]:
        """Catálogo del portal: eventos publicados con al menos una agenda activa
        (agenda y área activas). Solo información general e identificativa: la
        disponibilidad se consulta en el detalle de cada evento. Una sola consulta."""
        agendas = self.agendas.listar_publicas()
        por_servicio: dict[int, list] = {}
        for agenda in agendas:
            por_servicio.setdefault(agenda.servicio_id, []).append(agenda)
        eventos = [self._a_evento_publico(ags[0].servicio, ags) for ags in por_servicio.values()]
        return sorted(eventos, key=lambda e: e.nombre.lower())

    def obtener_evento_publico(self, servicio_id: int) -> EventoPublico:
        """Detalle de un evento con su disponibilidad: días reservables dentro de la vigencia
        y resumen de turnos libres (tres consultas agrupadas para todas sus agendas)."""
        servicio = self.repo.get(servicio_id)
        if not servicio or not servicio.activo:
            raise NotFound("Evento no encontrado o no disponible")
        agendas = self.agendas.listar_publicas(servicio_id=servicio_id)
        if not agendas:
            raise NotFound(motivo_participacion(servicio, now(), "reservas") or "Evento no encontrado o no disponible")

        evento = self._a_evento_publico(servicio, agendas)
        if evento.motivo_no_disponible:
            evento.dias_reservables = []
            return evento

        horarios = HorarioService(self.db)
        dias = horarios.fechas_reservables(servicio)
        resumen = horarios.resumen_disponibilidad(agendas, dias)
        resumenes = [resumen.get(a.id, ResumenTurnos()) for a in agendas]
        proximos = sorted((r.proxima_fecha, r.proxima_hora) for r in resumenes if r.proxima_fecha is not None)

        evento.dias_reservables = dias
        evento.turnos_disponibles = sum(r.disponibles for r in resumenes)
        evento.proximo_turno_fecha = proximos[0][0] if proximos else None
        evento.proximo_turno_hora = proximos[0][1] if proximos else None
        return evento

    @staticmethod
    def _a_evento_publico(servicio: Servicio, agendas: list) -> EventoPublico:
        areas: dict[int, str] = {}
        for agenda in agendas:
            areas[agenda.area_id] = agenda.area_nombre
        duraciones = [a.duracion_minutos for a in agendas]
        return EventoPublico(
            id=servicio.id,
            nombre=servicio.nombre,
            descripcion_corta=servicio.descripcion_corta,
            descripcion_larga=servicio.descripcion_larga,
            imagen_url=servicio.imagen_url,
            duracion_minutos=min(duraciones),
            duracion_maxima=max(duraciones),
            informacion_adicional=servicio.informacion_adicional,
            areas=list(areas.values()),
            area_ids=list(areas.keys()),
            agendas=[AgendaResumen(id=a.id, area_id=a.area_id, area_nombre=a.area_nombre) for a in agendas],
            vigencia_inicio=servicio.vigencia_inicio,
            vigencia_fin=servicio.vigencia_fin,
            motivo_no_disponible=motivo_participacion(servicio, now(), "reservas"),
            proximo_cambio_en=proximo_cambio_participacion(servicio, now()),
            regla_participacion=describir_regla_reserva(servicio.limite_participaciones, servicio.periodo_limite),
        )

    def _validar_nombre(self, nombre: str, excluir_id: int | None = None) -> None:
        otro = self.repo.by_nombre(nombre)
        if otro and otro.id != excluir_id:
            raise Conflict("Ya existe un evento con ese nombre")

    def crear(self, data: ServicioCreate, admin_id: int) -> Servicio:
        """Crea el evento y sus agendas (área + horario de atención + duración de turnos) en
        una sola transacción: si algo falla, no queda un evento suelto sin área ni una
        agenda a medias."""
        self._validar_nombre(data.nombre)
        if estado_participacion(data, now()) == "finalizado":
            raise DomainError("La fecha de finalización ya pasó: define una vigencia actual o futura.")
        areas = []
        for agenda_inicial in data.agendas:
            area = self.areas.get(agenda_inicial.area_id)
            if not area or not area.activo:
                raise DomainError("Selecciona un área activa para cada agenda del evento.")
            areas.append(area)
        limite, periodo = normalizar_regla_reserva(data.limite_participaciones, data.periodo_limite)

        datos = data.model_dump(exclude={"agenda", "agendas", "tipo"})
        datos.update(limite_participaciones=limite, periodo_limite=periodo)
        # La duración visible del evento sale de sus agendas (ya no se pide por separado).
        datos["duracion_minutos"] = min(a.duracion_minutos for a in data.agendas)
        serv = self.repo.add(Servicio(**datos))

        creadas = []
        for agenda_inicial, area in zip(data.agendas, areas):
            datos_agenda = agenda_inicial.model_dump()
            datos_agenda["nombre"] = (datos_agenda.get("nombre") or f"{serv.nombre} - {area.nombre}")[:140]
            creadas.append(self.agendas.add(Agenda(servicio_id=serv.id, activo=True, **datos_agenda)))

        auditoria_service.registrar(
            self.db, admin_id, "crear", "servicio", serv.id,
            datos_nuevos={**snapshot(serv, CAMPOS), "area_id": areas[0].id, "areas": [a.id for a in areas]},
        )
        for agenda in creadas:
            auditoria_service.registrar(
                self.db, admin_id, "crear", "agenda", agenda.id, datos_nuevos=snapshot(agenda, CAMPOS_AGENDA),
            )
        self.db.commit()
        return serv

    def obtener(self, servicio_id: int) -> Servicio:
        serv = self.repo.get(servicio_id)
        if not serv:
            raise NotFound("Evento no encontrado")
        return serv

    def actualizar(self, servicio_id: int, data: ServicioUpdate, admin_id: int) -> tuple[Servicio, list]:
        """Edita el evento. Si se acorta la vigencia, las reservas futuras que quedan fuera
        del nuevo periodo se CONSERVAN y se devuelven para que el administrador decida (las
        puede cancelar aparte, con notificación)."""
        serv = self.obtener(servicio_id)
        cambios = data.model_dump(exclude_unset=True, exclude={"tipo"})
        nulos = sorted(k for k, v in cambios.items() if v is None and k in NO_NULOS)
        if nulos:
            raise DomainError(f"Estos campos no pueden quedar vacíos: {', '.join(nulos)}")
        if "nombre" in cambios:
            self._validar_nombre(cambios["nombre"], excluir_id=serv.id)

        inicio = cambios.get("vigencia_inicio", serv.vigencia_inicio)
        fin = cambios.get("vigencia_fin", serv.vigencia_fin)
        cambia_vigencia = (inicio, fin) != (serv.vigencia_inicio, serv.vigencia_fin)
        if cambia_vigencia:
            validar_vigencia(inicio, fin)
        if "limite_participaciones" in cambios or "periodo_limite" in cambios:
            cambios["limite_participaciones"], cambios["periodo_limite"] = normalizar_regla_reserva(
                cambios.get("limite_participaciones", serv.limite_participaciones),
                cambios.get("periodo_limite", serv.periodo_limite),
            )

        horario = HorarioParticipacion(**{
            campo: cambios.get(campo, getattr(serv, campo))
            for campo in HorarioParticipacion.model_fields
        })
        try:
            validar_horario_participacion(inicio, fin, horario)
        except ValueError as exc:
            raise DomainError(str(exc)) from exc

        anteriores = snapshot(serv, CAMPOS)
        for k, v in cambios.items():
            setattr(serv, k, v)
        if cambia_vigencia and estado_vigencia(inicio, fin, today()) != "finalizado":
            # Vigencia extendida o reprogramada: el evento vuelve a estar en curso o próximo,
            # y la tarea programada registrará de nuevo su fin cuando llegue.
            serv.finalizado_en = None
        auditoria_service.registrar(
            self.db, admin_id, "editar", "servicio", serv.id,
            datos_anteriores=anteriores, datos_nuevos=snapshot(serv, CAMPOS),
        )
        self.db.commit()
        afectadas = (
            [a_admin_out(r) for r in self.reservas.activas_futuras_fuera_de(serv.id, inicio, fin)]
            if cambia_vigencia else []
        )
        return serv, afectadas

    def cambiar_estado(self, servicio_id: int, activo: bool, admin_id: int) -> tuple[Servicio, list]:
        serv = self.obtener(servicio_id)
        anteriores = snapshot(serv, CAMPOS)
        serv.activo = activo
        auditoria_service.registrar(
            self.db, admin_id, "activar" if activo else "desactivar", "servicio", servicio_id,
            datos_anteriores=anteriores, datos_nuevos=snapshot(serv, CAMPOS),
        )
        self.db.commit()
        afectadas = [] if activo else [a_admin_out(r) for r in self.reservas.activas_futuras(servicio_id=servicio_id)]
        return serv, afectadas

    def eliminar(self, servicio_id: int, admin_id: int) -> dict:
        """Borra el evento de verdad, con TODO su historial: a diferencia de desactivar (que
        conserva reservas e historial), esta acción es irreversible y elimina también sus
        agendas, sus reservas (en cualquier estado) y los bloqueos propios de esas agendas.
        Las notificaciones ya enviadas se conservan, solo pierden la referencia a la reserva
        borrada (igual que cuando se elimina la cuenta de un colaborador)."""
        serv = self.obtener(servicio_id)
        agenda_ids = list(self.db.execute(
            select(Agenda.id).where(Agenda.servicio_id == servicio_id)
        ).scalars().all())
        reserva_ids = list(self.db.execute(
            select(Reserva.id).where(Reserva.servicio_id == servicio_id)
        ).scalars().all())

        if reserva_ids:
            self.db.execute(update(Notificacion).where(Notificacion.reserva_id.in_(reserva_ids)).values(reserva_id=None))
        if agenda_ids:
            self.db.execute(delete(Bloqueo).where(Bloqueo.agenda_id.in_(agenda_ids)))
        self.db.execute(delete(Reserva).where(Reserva.servicio_id == servicio_id))
        self.db.execute(delete(Agenda).where(Agenda.servicio_id == servicio_id))

        auditoria_service.registrar(
            self.db, admin_id, "eliminar_evento", "servicio", servicio_id,
            datos_anteriores={
                "nombre": serv.nombre, "agendas_eliminadas": len(agenda_ids), "reservas_eliminadas": len(reserva_ids),
            },
        )
        self.db.delete(serv)
        self.db.commit()
        return {"agendas_eliminadas": len(agenda_ids), "reservas_eliminadas": len(reserva_ids)}
