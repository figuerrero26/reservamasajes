import api from "./api";
import type { Bloqueo, ConReservasAfectadas, ReservaAdmin } from "../types";

export const listarBloqueos = async (fecha?: string) =>
  (await api.get<Bloqueo[]>("/bloqueos", { params: fecha ? { fecha } : {} })).data;

export type BloqueoPayload = {
  agenda_id?: number | null;
  tipo: "dia" | "rango";
  fecha: string;
  hora_inicio?: string | null;
  hora_fin?: string | null;
  motivo?: string;
};

/** Crea el bloqueo y devuelve las reservas futuras que quedan dentro (no se cancelan solas). */
export const crearBloqueo = async (payload: BloqueoPayload) =>
  (await api.post<Bloqueo & ConReservasAfectadas>("/bloqueos", payload)).data;

export const reservasAfectadasBloqueo = async (id: number) =>
  (await api.get<ReservaAdmin[]>(`/bloqueos/${id}/reservas-afectadas`)).data;

export const eliminarBloqueo = async (id: number) => api.delete(`/bloqueos/${id}`);
