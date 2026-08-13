import api from "./api";
import type { Bloqueo } from "../types";

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

export const crearBloqueo = async (payload: BloqueoPayload) =>
  (await api.post<Bloqueo>("/bloqueos", payload)).data;

export const eliminarBloqueo = async (id: number) => api.delete(`/bloqueos/${id}`);
