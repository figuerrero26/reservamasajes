"""Servicio de reservas: aplica las reglas del evento (disponibilidad, vigencia y límite de
participación por persona), genera el slot solicitado y crea la reserva bajo control de
concurrencia.
"""
from collections import defaultdict
from datetime import date, time

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Agenda, Reserva, EstadoReserva, Servicio, Usuario
from app.repositories.agenda_repository import AgendaRepository
from app.repositories.configuracion_repository import ConfiguracionRepository
from app.repositories.reserva_repository import ReservaRepository
from app.repositories.usuario_repository import UsuarioRepository
from app.schemas.reserva import (
    AgendaDia, EstadoSlot, MiReservaOut, ReservaAdminOut, ReservaCreateManual, ReservaOut, SlotDia,
    VerificacionReservaOut,
)
from app.services import auditoria_service
from app.services.errors import Conflict, DomainError, Forbidden, NotFound
from app.services.horario_service import HorarioService, agenda_reservable, motivo_no_reservable
from app.utils.time import add_minutes, inicio_de, now, ya_empezo
from app.utils.vigencia import (
    desde_para_limite, fecha_en_vigencia, motivo_limite, para_administrador, rango_vigencia_texto,
)

MENSAJE_UNA_POR_DIA = "Ya tienes una reserva para este evento en esta fecha."


def motivo_limite_reserva(servicio: Servicio, fechas_previas: list[date], fecha: date) -> str | None:
    """Límite de participación de un evento por turnos para una reserva nueva en `fecha`.

    Siempre rige, como hasta ahora, una reserva por persona por día en cada evento (la
    respalda además el índice único de la tabla); el límite del evento se suma a esa regla
    (p. ej. "una sola vez en toda la vigencia" o "hasta 3 por semana", siempre en días
    distintos). `fechas_previas`: reservas NO canceladas de la persona en el evento."""
    if fecha in fechas_previas:
        return MENSAJE_UNA_POR_DIA
    return motivo_limite(
        fechas_previas, fecha, servicio.limite_participaciones, servicio.periodo_limite,
        servicio.vigencia_inicio, "reserva",
    )


def a_admin_out(r: Reserva) -> ReservaAdminOut:
    """Reserva con identidad del colaborador y nombres legibles. La identidad sale de la
    foto tomada al crear la reserva (ver Reserva.usuario_nombre): sigue disponible aunque el
    admin haya eliminado la cuenta del colaborador."""
    return ReservaAdminOut(
        **ReservaOut.model_validate(r).model_dump(),
        usuario_nombre=r.usuario_nombre,
        usuario_apellido=r.usuario_apellido,
        usuario_correo=r.usuario_correo,
        evento_nombre=r.servicio.nombre,
        area_nombre=r.agenda.area.nombre,
        agenda_nombre=r.agenda.nombre,
    )


class ReservaService:
    def __init__(self, db: Session):
        self.db = db
        self.usuarios = UsuarioRepository(db)
        self.agendas = AgendaRepository(db)
        self.reservas = ReservaRepository(db)
        self.configuracion = ConfiguracionRepository(db)
        self.horarios = HorarioService(db)

    def _crear(self, usuario_id: int, agenda_id: int, fecha: date, hora_inicio: time,
               notes: str | None, admin_id: int | None) -> Reserva:
        # Bloquea la fila del usuario durante la transacción: serializa los intentos
        # concurrentes de la MISMA persona (MariaDB no admite un índice condicionado a un
        # flag de otra fila, así que el chequeo de la regla se hace también a nivel de
        # aplicación; el anti-duplicado real, en cambio, lo garantizan los dos índices
        # únicos de la tabla `reservas` — ver app/models/reserva.py).
        usuario = self.db.execute(
            select(Usuario).where(Usuario.id == usuario_id).with_for_update()
        ).scalar_one_or_none()
        if not usuario or not usuario.activo:
            raise NotFound("Usuario no encontrado o inactivo")

        agenda = self.agendas.get(agenda_id)
        # Reglas del evento (aplican igual a la reserva manual del administrador): agenda,
        # evento y área activos; evento dentro de su vigencia; fecha dentro de la vigencia.
        motivo = self._motivo_evento(agenda, fecha)
        if motivo:
            raise DomainError(motivo)
        # Límite de participación del evento, contado sobre el historial no cancelado de la
        # persona. Para casos puntuales existe la excepción por usuario
        # `permite_reservas_multiples`.
        motivo = self._motivo_limite(usuario, agenda.servicio, fecha)
        if motivo:
            raise Conflict(para_administrador(motivo) if admin_id else motivo)

        # El slot solicitado debe existir y estar disponible según la generación dinámica.
        slots = self.horarios.generar(agenda_id, fecha)
        match = next((s for s in slots if s.hora_inicio == hora_inicio), None)
        if match is None:
            raise DomainError("El horario solicitado no es válido para esta agenda")
        if match.estado != EstadoSlot.DISPONIBLE:
            raise Conflict("El horario ya no está disponible")

        reserva = Reserva(
            agenda_id=agenda_id,
            servicio_id=agenda.servicio_id,
            usuario_id=usuario.id,
            fecha=fecha,
            hora_inicio=hora_inicio,
            hora_fin=add_minutes(hora_inicio, agenda.duracion_minutos),
            estado=EstadoReserva.ACTIVA.value,
            # Foto del flag al momento de crear: así el índice único de BD (que no puede
            # leer otra tabla) también respeta la excepción — ver app/models/reserva.py.
            permite_multiple_evento_dia=usuario.permite_reservas_multiples,
            # Foto de la identidad: sobrevive a que el admin elimine la cuenta más adelante.
            usuario_nombre=usuario.nombre,
            usuario_apellido=usuario.apellido,
            usuario_correo=usuario.correo,
            notes=notes,
        )
        self.db.add(reserva)
        try:
            # Última barrera: los índices únicos de la tabla resuelven las confirmaciones
            # simultáneas aunque dos procesos hayan pasado las validaciones anteriores a la vez.
            self.db.flush()
        except IntegrityError as exc:
            self.db.rollback()
            if "uq_reserva_activa_evento_dia" in str(getattr(exc, "orig", exc)):
                raise Conflict(MENSAJE_UNA_POR_DIA)
            raise Conflict("El horario seleccionado acaba de ser reservado. Por favor seleccione otro horario")

        accion = "crear_reserva_admin" if admin_id else "crear_reserva"
        auditoria_service.registrar(
            self.db, admin_id, accion, "reserva", reserva.id,
            datos_nuevos={"usuario_id": usuario.id, "agenda_id": agenda_id,
                         "fecha": fecha.isoformat(), "hora_inicio": hora_inicio.isoformat()},
        )
        self.db.commit()
        self.db.refresh(reserva)
        return reserva

    @staticmethod
    def _motivo_evento(agenda: Agenda | None, fecha: date) -> str | None:
        if agenda is None:
            return "Este evento no está disponible para reservas en este momento."
        motivo = motivo_no_reservable(agenda)
        if motivo:
            return motivo
        servicio = agenda.servicio
        if not fecha_en_vigencia(servicio.vigencia_inicio, servicio.vigencia_fin, fecha):
            return (f"Este evento solo recibe reservas "
                    f"{rango_vigencia_texto(servicio.vigencia_inicio, servicio.vigencia_fin)}.")
        return None

    def _motivo_limite(self, usuario: Usuario, servicio: Servicio, fecha: date) -> str | None:
        if usuario.permite_reservas_multiples:
            return None
        desde = desde_para_limite(fecha, servicio.periodo_limite, servicio.vigencia_inicio)
        return motivo_limite_reserva(servicio, self.reservas.fechas_participacion(usuario.id, servicio.id, desde), fecha)

    def verificar(self, usuario_id: int, agenda_id: int, fecha: date) -> VerificacionReservaOut:
        """¿Puede esta persona reservar en este evento ese día? Mismas reglas que la creación
        (sin el turno concreto), para que el portal avise antes de elegir un horario. La
        validación definitiva sigue ocurriendo al crear la reserva."""
        usuario = self.usuarios.get(usuario_id)
        if not usuario or not usuario.activo:
            raise NotFound("Usuario no encontrado o inactivo")
        if fecha < now().date():
            return VerificacionReservaOut(permitido=False, motivo="La fecha ya pasó.")
        agenda = self.agendas.get(agenda_id)
        motivo = self._motivo_evento(agenda, fecha) or self._motivo_limite(usuario, agenda.servicio, fecha)
        return VerificacionReservaOut(permitido=motivo is None, motivo=motivo)

    def crear(self, agenda_id: int, fecha: date, hora_inicio: time, usuario_id: int) -> Reserva:
        """Reserva creada por el propio usuario autenticado (portal público)."""
        return self._crear(usuario_id, agenda_id, fecha, hora_inicio, None, None)

    def crear_manual(self, data: ReservaCreateManual, admin_id: int) -> Reserva:
        """Reserva creada directamente por el administrador en nombre de un colaborador."""
        usuario = self.usuarios.by_correo(data.correo)
        if not usuario:
            raise NotFound("No existe ningún colaborador con ese correo")
        return self._crear(usuario.id, data.agenda_id, data.fecha, data.hora_inicio, data.notes, admin_id)

    def _marcar_cancelada(self, reserva: Reserva, actor: str) -> None:
        reserva.estado = EstadoReserva.CANCELADA.value
        reserva.cancelled_at = now()
        reserva.cancelled_by = actor[:80]

    def cancelar(self, reserva_id: int, admin_id: int | None, actor_nombre: str,
                 motivo: str | None = None) -> Reserva:
        """Cancelación administrativa (sin restricción de anticipación). La notificación al
        colaborador la dispara la capa API en segundo plano, después del commit."""
        reserva = self.reservas.get(reserva_id)
        if not reserva:
            raise NotFound("Reserva no encontrada")
        if reserva.estado != EstadoReserva.ACTIVA.value:
            raise DomainError("La reserva no está activa")
        self._marcar_cancelada(reserva, actor_nombre)
        auditoria_service.registrar(
            self.db, admin_id, "cancelar", "reserva", reserva.id,
            datos_nuevos={"motivo": motivo} if motivo else None,
        )
        self.db.commit()  # el horario queda libre automáticamente (slot_lock vuelve a NULL)
        return reserva

    def cancelar_lote(self, reserva_ids: list[int], admin_id: int, actor_nombre: str,
                      motivo: str | None = None) -> tuple[list[int], list[int]]:
        """Cancela varias reservas en una sola transacción (las que siguen activas). Las que
        ya no lo están se informan como omitidas en vez de hacer fallar todo el lote."""
        ids = list(dict.fromkeys(reserva_ids))
        encontradas = {r.id: r for r in self.reservas.por_ids(ids)}
        canceladas, omitidas = [], []
        for rid in ids:
            reserva = encontradas.get(rid)
            if reserva is None or reserva.estado != EstadoReserva.ACTIVA.value:
                omitidas.append(rid)
                continue
            self._marcar_cancelada(reserva, actor_nombre)
            canceladas.append(rid)
        if canceladas:
            auditoria_service.registrar(
                self.db, admin_id, "cancelar_lote", "reserva", None,
                datos_nuevos={"reservas": canceladas, "motivo": motivo},
            )
        self.db.commit()
        return canceladas, omitidas

    def cancelar_propia(self, reserva_id: int, usuario_id: int) -> Reserva:
        """Cancelación por el propio dueño de la reserva, sujeta a la política configurada.
        Nunca se puede cancelar una reserva cuyo horario ya empezó: ya ocurrió, así que no
        tiene sentido liberar el turno."""
        reserva = self.reservas.get(reserva_id)
        if not reserva:
            raise NotFound("Reserva no encontrada")
        if reserva.usuario_id != usuario_id:
            raise Forbidden("No puedes cancelar una reserva que no es tuya")
        if reserva.estado != EstadoReserva.ACTIVA.value:
            raise DomainError("La reserva no está activa")
        if ya_empezo(reserva.fecha, reserva.hora_inicio):
            raise DomainError("Esta reserva ya ocurrió o está en curso; no se puede cancelar.")

        horas_minimas = self._horas_minimas_cancelacion()
        if horas_minimas > 0:
            horas_restantes = (inicio_de(reserva.fecha, reserva.hora_inicio) - now()).total_seconds() / 3600
            if horas_restantes < horas_minimas:
                raise DomainError(
                    f"No se puede cancelar con menos de {horas_minimas} hora(s) de anticipación."
                )

        self._marcar_cancelada(reserva, "usuario")
        auditoria_service.registrar(
            self.db, None, "cancelar_propia", "reserva", reserva.id,
            datos_nuevos={"usuario_id": usuario_id},
        )
        self.db.commit()
        return reserva

    def _horas_minimas_cancelacion(self) -> int:
        valor = self.configuracion.get("cancelacion_horas_minimas")
        try:
            return max(0, int(valor)) if valor not in (None, "") else 0
        except ValueError:
            # Datos guardados antes de que existiera la validación de configuración: un
            # valor ilegible no debe bloquear todas las cancelaciones.
            return 0

    def mias(self, usuario_id: int) -> list[MiReservaOut]:
        horas_minimas = self._horas_minimas_cancelacion()
        ahora = now()
        resultado = []
        for r in self.reservas.mias(usuario_id):
            inicio = inicio_de(r.fecha, r.hora_inicio)
            puede_cancelar = (
                r.estado == EstadoReserva.ACTIVA.value
                and inicio > ahora
                and (inicio - ahora).total_seconds() / 3600 >= horas_minimas
            )
            resultado.append(MiReservaOut(
                **ReservaOut.model_validate(r).model_dump(),
                evento_nombre=r.servicio.nombre, area_nombre=r.agenda.area.nombre,
                puede_cancelar=puede_cancelar,
            ))
        return resultado

    def buscar(self, nombre: str | None = None, correo: str | None = None,
               fecha: date | None = None, agenda_id: int | None = None,
               servicio_id: int | None = None, estado: str | None = None) -> list[ReservaAdminOut]:
        """Listado administrativo: quién reservó qué, con nombre/correo del colaborador y
        nombres legibles de evento/área/agenda (ver ReservaAdminOut). Al consultar un evento
        puntual (`servicio_id`), se excluyen las reservas anteriores al inicio de su vigencia
        actual: si el evento se reprogramó, las reservas de una vigencia anterior ya no
        corresponden a la configuración vigente y solo confunden. Sin tope final: igual que
        el límite de participación por "evento" (ver `ventana_limite`), una reserva futura que
        quedó fuera de una vigencia acortada se conserva y se sigue mostrando (el administrador
        decide si la cancela; no debe desaparecer sola del historial)."""
        reservas = self.reservas.buscar(
            nombre=nombre, correo=correo, fecha=fecha, agenda_id=agenda_id,
            servicio_id=servicio_id, estado=estado,
        )
        if servicio_id:
            servicio = self.db.get(Servicio, servicio_id)
            if servicio and servicio.vigencia_inicio:
                reservas = [r for r in reservas if r.fecha >= servicio.vigencia_inicio]
        return [a_admin_out(r) for r in reservas]

    def dia(self, fecha: date, servicio_id: int | None = None) -> list[AgendaDia]:
        """Vista "por día" del panel: TODOS los turnos de TODAS las agendas activas (y de las
        inactivas que todavía tengan reservas ese día), disponibles, ocupados, bloqueados o
        pasados. Usa la misma generación dinámica del portal público para que también se
        vean los espacios libres.

        Ninguna reserva no cancelada del día puede quedar oculta: si el día está bloqueado o
        es festivo, sus turnos se muestran como BLOQUEADO con la reserva adentro; si una
        reserva no coincide con ningún turno de la grilla actual, se agrega igual marcada
        como `fuera_de_grilla`."""
        reservas_por_agenda: dict[int, list[Reserva]] = defaultdict(list)
        for r in self.reservas.no_canceladas_por_fecha(fecha):
            if servicio_id is None or r.servicio_id == servicio_id:
                reservas_por_agenda[r.agenda_id].append(r)

        agendas: dict[int, Agenda] = {a.id: a for a in self.agendas.list_activas(servicio_id=servicio_id)}
        for agenda_id in reservas_por_agenda:
            if agenda_id not in agendas:
                agenda = self.agendas.get(agenda_id)
                if agenda:
                    agendas[agenda_id] = agenda

        resultado = []
        for agenda in sorted(agendas.values(), key=lambda a: (a.servicio.nombre, a.area.nombre, a.nombre)):
            slots = self.horarios.generar(agenda.id, fecha, incluir_pasado=True) if agenda.activo else []
            pendientes = {r.hora_inicio: r for r in reservas_por_agenda.get(agenda.id, [])}
            slots_dia = []
            for s in slots:
                r = pendientes.pop(s.hora_inicio, None)
                estado = s.estado if not r or s.estado == EstadoSlot.BLOQUEADO else EstadoSlot.OCUPADO
                slots_dia.append(self._slot_dia(s.hora_inicio, s.hora_fin, estado, r))
            for r in pendientes.values():
                slots_dia.append(self._slot_dia(r.hora_inicio, r.hora_fin, EstadoSlot.OCUPADO, r, True))
            slots_dia.sort(key=lambda s: s.hora_inicio)
            resultado.append(AgendaDia(
                agenda_id=agenda.id, agenda_nombre=agenda.nombre,
                area_nombre=agenda.area.nombre, evento_nombre=agenda.servicio.nombre,
                agenda_activa=agenda_reservable(agenda), slots=slots_dia,
            ))
        return resultado

    @staticmethod
    def _slot_dia(hora_inicio: time, hora_fin: time, estado: EstadoSlot, r: Reserva | None,
                  fuera_de_grilla: bool = False) -> SlotDia:
        return SlotDia(
            hora_inicio=hora_inicio, hora_fin=hora_fin, estado=estado,
            reserva_id=r.id if r else None,
            reserva_estado=r.estado if r else None,
            usuario_nombre=r.usuario_nombre if r else None,
            usuario_apellido=r.usuario_apellido if r else None,
            usuario_correo=r.usuario_correo if r else None,
            notes=r.notes if r else None,
            fuera_de_grilla=fuera_de_grilla,
        )

    def habilitar_reserva_extra(self, usuario_id: int, admin_id: int, permitir: bool = True) -> None:
        """Habilita o revoca la excepción a los límites de participación de los eventos
        (incluida la regla de una reserva por evento por día)."""
        usuario = self.usuarios.get(usuario_id)
        if not usuario:
            raise NotFound("Colaborador no encontrado")
        usuario.permite_reservas_multiples = permitir
        auditoria_service.registrar(
            self.db, admin_id, "habilitar_reserva_multiple" if permitir else "revocar_reserva_multiple",
            "usuario", usuario_id,
        )
        self.db.commit()
