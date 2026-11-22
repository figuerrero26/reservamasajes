import api from "./api";
import type { ConReservasAfectadas, Servicio } from "../types";

export const listarServicios = async () => (await api.get<Servicio[]>("/servicios")).data;

export type ServicioPayload = {
  nombre: string;
  descripcion_corta?: string | null;
  descripcion_larga?: string | null;
  imagen_url?: string | null;
  duracion_minutos: number;
  informacion_adicional?: string | null;
  activo?: boolean;
};

export const crearServicio = async (payload: ServicioPayload) =>
  (await api.post<Servicio>("/servicios", payload)).data;

export const actualizarServicio = async (id: number, payload: Partial<ServicioPayload>) =>
  (await api.put<Servicio>(`/servicios/${id}`, payload)).data;

/** Corta nuevas reservas del evento; devuelve las reservas futuras que se conservan. */
export const desactivarServicio = async (id: number) =>
  (await api.post<Servicio & ConReservasAfectadas>(`/servicios/${id}/desactivar`)).data;

export const activarServicio = async (id: number) =>
  (await api.post<Servicio & ConReservasAfectadas>(`/servicios/${id}/activar`)).data;
