import apiUsuario from "./apiUsuario";
import type { EventoPublico } from "../types";

export async function listarEventos(): Promise<EventoPublico[]> {
  const { data } = await apiUsuario.get<EventoPublico[]>("/eventos");
  return data;
}

export async function obtenerEvento(id: number): Promise<EventoPublico> {
  const { data } = await apiUsuario.get<EventoPublico>(`/eventos/${id}`);
  return data;
}
