import api from "./api";
import apiUsuario from "./apiUsuario";
import type {
  AgendaDia, CancelarLoteResultado, HorariosResponse, MiReserva, Reserva, ReservaAdmin, ReservaCreada,
  VerificacionReserva,
} from "../types";

// ---- Portal público (requiere sesión de usuario, salvo horarios que es abierto) ----
export async function obtenerHorarios(agendaId: number, fecha: string): Promise<HorariosResponse> {
  const { data } = await apiUsuario.get<HorariosResponse>(`/agendas/${agendaId}/horarios`, {
    params: { fecha },
  });
  return data;
}

export async function crearReserva(payload: {
  agenda_id: number;
  fecha: string;
  hora_inicio: string;
}): Promise<ReservaCreada> {
  const { data } = await apiUsuario.post<ReservaCreada>("/reservas", payload);
  return data;
}

/** Antes de elegir un turno: ¿el colaborador puede reservar en este evento ese día? (vigencia
 * del evento y límite de participación). La validación definitiva ocurre al reservar. */
export async function verificarReserva(agendaId: number, fecha: string): Promise<VerificacionReserva> {
  const { data } = await apiUsuario.get<VerificacionReserva>("/reservas/verificar", {
    params: { agenda_id: agendaId, fecha },
  });
  return data;
}

export async function misReservas(): Promise<MiReserva[]> {
  const { data } = await apiUsuario.get<MiReserva[]>("/reservas/mias");
  return data;
}

export async function cancelarReservaPropia(id: number): Promise<Reserva> {
  const { data } = await apiUsuario.post<Reserva>(`/reservas/${id}/cancelar`);
  return data;
}

// ---- Administración ----
/** Historial de reservas de un evento (todas, en cualquier estado; también de eventos finalizados). */
export async function buscarReservas(filtros: { servicio_id?: number; estado?: string }): Promise<ReservaAdmin[]> {
  const { data } = await api.get<ReservaAdmin[]>("/reservas", { params: filtros });
  return data;
}

export async function obtenerDia(fecha: string, servicioId?: number): Promise<AgendaDia[]> {
  const { data } = await api.get<AgendaDia[]>("/reservas/dia", {
    params: { fecha, servicio_id: servicioId },
  });
  return data;
}

export async function crearReservaManual(payload: {
  correo: string; agenda_id: number; fecha: string; hora_inicio: string; notes?: string;
}): Promise<ReservaCreada> {
  const { data } = await api.post<ReservaCreada>("/reservas/manual", payload);
  return data;
}

/** Cancelación administrativa. Por defecto avisa al colaborador por correo. */
export async function cancelarReserva(
  id: number, opciones: { motivo?: string | null; notificar?: boolean } = {},
): Promise<Reserva> {
  const { data } = await api.post<Reserva>(`/reservas/${id}/cancelar-admin`, {
    motivo: opciones.motivo || null, notificar: opciones.notificar ?? true,
  });
  return data;
}

/** Cancela varias reservas a la vez (p. ej. las afectadas por un bloqueo o un festivo). */
export async function cancelarReservasLote(
  reservaIds: number[], opciones: { motivo?: string | null; notificar?: boolean } = {},
): Promise<CancelarLoteResultado> {
  const { data } = await api.post<CancelarLoteResultado>("/reservas/cancelar-lote", {
    reserva_ids: reservaIds, motivo: opciones.motivo || null, notificar: opciones.notificar ?? true,
  });
  return data;
}

export async function marcarAsistencia(id: number, asistio: boolean): Promise<Reserva> {
  const { data } = await api.post<Reserva>(`/reservas/${id}/asistencia`, { asistio });
  return data;
}
