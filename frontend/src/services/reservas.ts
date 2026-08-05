import api from "./api";
import type { AgendaPublica, HorariosResponse, Reserva } from "../types";

export async function listarAgendasPublicas(): Promise<AgendaPublica[]> {
  const { data } = await api.get<AgendaPublica[]>("/agendas/publicas");
  return data;
}

export async function validarCedula(cedula: string) {
  const { data } = await api.post<{ valido: boolean; tiene_reserva_activa: boolean }>(
    "/reservas/validar-cedula",
    { cedula }
  );
  return data;
}

export async function obtenerHorarios(agendaId: number, fecha: string): Promise<HorariosResponse> {
  const { data } = await api.get<HorariosResponse>(`/agendas/${agendaId}/horarios`, {
    params: { fecha },
  });
  return data;
}

export async function crearReserva(payload: {
  cedula: string;
  agenda_id: number;
  fecha: string;
  hora_inicio: string;
}): Promise<Reserva> {
  const { data } = await api.post<Reserva>("/reservas", payload);
  return data;
}
