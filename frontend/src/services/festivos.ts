import api from "./api";
import type { ConReservasAfectadas, Festivo, ReservaAdmin } from "../types";

export const listarFestivos = async () => (await api.get<Festivo[]>("/festivos")).data;

export const crearFestivo = async (payload: { fecha: string; nombre: string; descripcion?: string }) =>
  (await api.post<Festivo & ConReservasAfectadas>("/festivos", payload)).data;

export const actualizarFestivo = async (id: number, payload: Partial<Festivo>) =>
  (await api.put<Festivo & ConReservasAfectadas>(`/festivos/${id}`, payload)).data;

export const reservasAfectadasFestivo = async (id: number) =>
  (await api.get<ReservaAdmin[]>(`/festivos/${id}/reservas-afectadas`)).data;

export const eliminarFestivo = async (id: number) => api.delete(`/festivos/${id}`);
