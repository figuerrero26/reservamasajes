"""Servicio de reservas: aplica la regla de una reserva por usuario+evento+día, genera el
slot solicitado y crea la reserva bajo control de concurrencia.
"""
from collections import defaultdict
from datetime import date, time

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Agenda, Reserva, EstadoReserva, Usuario
from app.repositories.agenda_repository import AgendaRepository
from app.repositories.configuracion_repository import ConfiguracionRepository
from app.repositories.reserva_repository import ReservaRepository
from app.repositories.usuario_repository import UsuarioRepository
from app.schemas.reserva import (
    AgendaDia, EstadoSlot, MiReservaOut, ReservaAdminOut, ReservaCreateManual, ReservaOut, SlotDia,
)
from app.services import auditoria_service
from app.services.errors import Conflict, DomainError, Forbidden, NotFound
from app.services.horario_service import HorarioService, agenda_reservable
from app.utils.time import add_minutes, inicio_de, now, ya_empezo


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
        # La agenda, su evento y su área deben estar activos: desactivar un evento corta la
        # creación de reservas también por API, no solo ocultándolo en el portal. Aplica
        # igual a la reserva manual del administrador.
        if not agenda or not agenda_reservable(agenda):
            raise DomainError("Este evento no está disponible para reservas en este momento.")

        # Regla: máximo una reserva activa por usuario+evento+día — o, si el admin activó
        # la restricción opcional `evento_unico_por_semana`, por usuario+evento+semana
        # activa completa. No exime a la reserva manual del admin; para casos puntuales
        # existe la excepción por usuario `permite_reservas_multiples`.
        existente = self.reservas.activa_por_usuario_evento_fecha(usuario.id, agenda.servicio_id, fecha)
        mensaje_conflicto = "Ya tienes una reserva para este evento en esta fecha."
        if not existente and self.configuracion.get("evento_unico_por_semana") == "true":
            inicio_str = self.configuracion.get("semana_activa_inicio")
            fin_str = self.configuracion.get("semana_activa_fin")
            if inicio_str and fin_str:
                inicio_semana, fin_semana = date.fromisoformat(inicio_str), date.fromisoformat(fin_str)
                if inicio_semana <= fecha <= fin_semana:
                    existente = self.reservas.activa_por_usuario_evento_rango(
                        usuario.id, agenda.servicio_id, inicio_semana, fin_semana,
                    )
                    mensaje_conflicto = "Ya tienes una reserva para este evento esta semana."
        if existente and not usuario.permite_reservas_multiples:
            raise Conflict(mensaje_conflicto)

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
                raise Conflict("Ya tienes una reserva para este evento en esta fecha.")
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
        Nunca se puede cancelar una reserva cuyo horario ya empezó: eso es asistencia o
        inasistencia, y la registra el administrador."""
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
        nombres legibles de evento/área/agenda (ver ReservaAdminOut)."""
        reservas = self.reservas.buscar(
            nombre=nombre, correo=correo, fecha=fecha, agenda_id=agenda_id,
            servicio_id=servicio_id, estado=estado,
        )
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

        ahora = now()
        resultado = []
        for agenda in sorted(agendas.values(), key=lambda a: (a.servicio.nombre, a.area.nombre, a.nombre)):
            slots = self.horarios.generar(agenda.id, fecha, incluir_pasado=True) if agenda.activo else []
            pendientes = {r.hora_inicio: r for r in reservas_por_agenda.get(agenda.id, [])}
            slots_dia = []
            for s in slots:
                r = pendientes.pop(s.hora_inicio, None)
                # HorarioService solo conoce reservas `activa` al calcular disponibilidad; si
                # esta ya se marcó completada/no_asistio, forzamos el turno a "ocupado" para
                # que el panel nunca lo muestre como libre (el detalle va en reserva_estado).
                estado = s.estado if not r or s.estado == EstadoSlot.BLOQUEADO else EstadoSlot.OCUPADO
                slots_dia.append(self._slot_dia(s.hora_inicio, s.hora_fin, estado, r, ahora))
            for r in pendientes.values():
                slots_dia.append(self._slot_dia(r.hora_inicio, r.hora_fin, EstadoSlot.OCUPADO, r, ahora, True))
            slots_dia.sort(key=lambda s: s.hora_inicio)
            resultado.append(AgendaDia(
                agenda_id=agenda.id, agenda_nombre=agenda.nombre,
                area_nombre=agenda.area.nombre, evento_nombre=agenda.servicio.nombre,
                agenda_activa=agenda_reservable(agenda), slots=slots_dia,
            ))
        return resultado

    @staticmethod
    def _slot_dia(hora_inicio: time, hora_fin: time, estado: EstadoSlot, r: Reserva | None,
                  ahora, fuera_de_grilla: bool = False) -> SlotDia:
        return SlotDia(
            hora_inicio=hora_inicio, hora_fin=hora_fin, estado=estado,
            reserva_id=r.id if r else None,
            reserva_estado=r.estado if r else None,
            puede_marcar_asistencia=bool(
                r and r.estado == EstadoReserva.ACTIVA.value and inicio_de(r.fecha, r.hora_inicio) <= ahora
            ),
            usuario_nombre=r.usuario_nombre if r else None,
            usuario_apellido=r.usuario_apellido if r else None,
            usuario_correo=r.usuario_correo if r else None,
            notes=r.notes if r else None,
            fuera_de_grilla=fuera_de_grilla,
        )

    def marcar_asistencia(self, reserva_id: int, asistio: bool, admin_id: int) -> Reserva:
        """Cierra el ciclo de una reserva cuyo horario ya pasó: registra si el colaborador
        asistió o no. A diferencia de `cancelar()`, el turno NO vuelve a quedar disponible."""
        reserva = self.reservas.get(reserva_id)
        if not reserva:
            raise NotFound("Reserva no encontrada")
        if reserva.estado != EstadoReserva.ACTIVA.value:
            raise DomainError("La reserva no está activa")
        if not ya_empezo(reserva.fecha, reserva.hora_inicio):
            raise DomainError("No se puede marcar asistencia de una reserva que aún no ha ocurrido")

        reserva.estado = EstadoReserva.COMPLETADA.value if asistio else EstadoReserva.NO_ASISTIO.value
        auditoria_service.registrar(
            self.db, admin_id, "marcar_asistencia", "reserva", reserva.id,
            datos_nuevos={"estado": reserva.estado},
        )
        self.db.commit()
        return reserva

    def reiniciar_semana(self, fecha_lunes: date, admin_id: int) -> list[int]:
        """Reinicio semanal por cambio de estado: conserva la trazabilidad, nunca borra filas.

        Solo cancela reservas que todavía no han ocurrido: las que ya pasaron quedan activas
        para que el administrador registre la asistencia. Devuelve los ids cancelados (la
        capa API notifica a cada colaborador)."""
        from datetime import timedelta
        if fecha_lunes.weekday() != 0:
            raise DomainError("La fecha indicada debe ser un lunes.")
        fin = fecha_lunes + timedelta(days=6)
        activas = self.reservas.activas_desde(fecha_lunes, fin)
        for r in activas:
            self._marcar_cancelada(r, "reinicio_semana")
        auditoria_service.registrar(
            self.db, admin_id, "reiniciar_semana", "reserva", None,
            datos_nuevos={"semana": fecha_lunes.isoformat(), "reservas_afectadas": len(activas)},
        )
        self.db.commit()
        return [r.id for r in activas]

    def habilitar_reserva_extra(self, usuario_id: int, admin_id: int, permitir: bool = True) -> None:
        """Habilita o revoca la excepción a la regla de una reserva por evento por día."""
        usuario = self.usuarios.get(usuario_id)
        if not usuario:
            raise NotFound("Colaborador no encontrado")
        usuario.permite_reservas_multiples = permitir
        auditoria_service.registrar(
            self.db, admin_id, "habilitar_reserva_multiple" if permitir else "revocar_reserva_multiple",
            "usuario", usuario_id,
        )
        self.db.commit()
