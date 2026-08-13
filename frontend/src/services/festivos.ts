import api from "./api";
import type { Festivo } from "../types";

export const listarFestivos = async () => (await api.get<Festivo[]>("/festivos")).data;

export const crearFestivo = async (payload: { fecha: string; nombre: string; descripcion?: string }) =>
  (await api.post<Festivo>("/festivos", payload)).data;

export const actualizarFestivo = async (id: number, payload: Partial<Festivo>) =>
  (await api.put<Festivo>(`/festivos/${id}`, payload)).data;

export const eliminarFestivo = async (id: number) => api.delete(`/festivos/${id}`);
