import api from "./api";
import type { Area } from "../types";

export const listarAreas = async () => (await api.get<Area[]>("/areas")).data;

export const crearArea = async (payload: { nombre: string; descripcion?: string }) =>
  (await api.post<Area>("/areas", payload)).data;

export const actualizarArea = async (id: number, payload: Partial<Area>) =>
  (await api.put<Area>(`/areas/${id}`, payload)).data;

export const desactivarArea = async (id: number) =>
  (await api.post<Area>(`/areas/${id}/desactivar`)).data;
