import api from "./api";
import apiUsuario from "./apiUsuario";
import type { Agenda, AgendaPublica } from "../types";

export const listarAgendas = async () => (await api.get<Agenda[]>("/agendas")).data;

/** Público: agendas activas de un evento, para el sub-selector de área cuando hay más de una. */
export const listarAgendasPublicas = async (servicioId: number) =>
  (await apiUsuario.get<AgendaPublica[]>("/agendas/publicas", { params: { servicio_id: servicioId } })).data;

export type AgendaPayload = {
  nombre: string;
  area_id: number;
  servicio_id: number;
  hora_inicio: string;
  hora_fin: string;
  almuerzo_inicio?: string | null;
  almuerzo_fin?: string | null;
  duracion_minutos: number;
  dias_habilitados: string;
  activo?: boolean;
};

export const crearAgenda = async (payload: AgendaPayload) =>
  (await api.post<Agenda>("/agendas", payload)).data;

export const actualizarAgenda = async (id: number, payload: Partial<AgendaPayload>) =>
  (await api.put<Agenda>(`/agendas/${id}`, payload)).data;

export const cambiarEstadoAgenda = async (id: number, activa: boolean) =>
  (await api.patch<Agenda>(`/agendas/${id}/estado`, null, { params: { activa } })).data;
