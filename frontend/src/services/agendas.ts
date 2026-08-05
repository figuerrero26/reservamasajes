import api from "./api";
import type { Agenda, Area, Servicio } from "../types";

export const listarAreas = async () => (await api.get<Area[]>("/areas")).data;
export const crearArea = async (nombre: string) =>
  (await api.post<Area>("/areas", { nombre })).data;

export const listarServicios = async () => (await api.get<Servicio[]>("/servicios")).data;
export const crearServicio = async (nombre: string) =>
  (await api.post<Servicio>("/servicios", { nombre })).data;

export const listarAgendas = async () => (await api.get<Agenda[]>("/agendas")).data;
export const cambiarEstadoAgenda = async (id: number, activa: boolean) =>
  (await api.patch<Agenda>(`/agendas/${id}/estado`, null, { params: { activa } })).data;
