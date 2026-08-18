import api from "./api";
import apiUsuario from "./apiUsuario";
import type { AgendaDia, HorariosResponse, Reserva, ReservaAdmin, ReservaCreada } from "../types";

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

export async function misReservas(): Promise<Reserva[]> {
  const { data } = await apiUsuario.get<Reserva[]>("/reservas/mias");
  return data;
}

export async function cancelarReservaPropia(id: number): Promise<Reserva> {
  const { data } = await apiUsuario.post<Reserva>(`/reservas/${id}/cancelar`);
  return data;
}

// ---- Administración ----
export async function obtenerDia(fecha: string, servicioId?: number): Promise<AgendaDia[]> {
  const { data } = await api.get<AgendaDia[]>("/reservas/dia", {
    params: { fecha, servicio_id: servicioId },
  });
  return data;
}

export async function buscarReservas(params: {
  nombre?: string; correo?: string; fecha?: string; agenda_id?: number; servicio_id?: number;
  estado?: string;
}): Promise<ReservaAdmin[]> {
  const { data } = await api.get<ReservaAdmin[]>("/reservas", { params });
  return data;
}

export async function crearReservaManual(payload: {
  correo: string; agenda_id: number; fecha: string; hora_inicio: string; notes?: string;
}): Promise<ReservaCreada> {
  const { data } = await api.post<ReservaCreada>("/reservas/manual", payload);
  return data;
}

export async function cancelarReserva(id: number): Promise<Reserva> {
  const { data } = await api.delete<Reserva>(`/reservas/${id}`);
  return data;
}
