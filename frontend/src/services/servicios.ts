import api from "./api";
import type { ConReservasAfectadas, Servicio } from "../types";

/** Eventos por turnos. Con `areaId`, solo los que tienen agenda en esa área. */
export const listarServicios = async (areaId?: number) =>
  (await api.get<Servicio[]>("/servicios", { params: areaId ? { area_id: areaId } : {} })).data;

/** Área y horario con los que nace un evento por turnos (su primera agenda). */
export interface AgendaInicialPayload {
  area_id: number;
  nombre?: string | null;
  hora_inicio: string;
  hora_fin: string;
  almuerzo_inicio?: string | null;
  almuerzo_fin?: string | null;
  duracion_minutos: number;
  dias_habilitados: string;
}

export interface ServicioInfoPayload {
  nombre: string;
  descripcion_corta?: string | null;
  descripcion_larga?: string | null;
  imagen_url?: string | null;
  informacion_adicional?: string | null;
  activo?: boolean;
}

/** Crea el evento junto con su área y su primera agenda (una sola operación en el backend). */
export const crearServicio = async (payload: ServicioInfoPayload & { agenda: AgendaInicialPayload }) =>
  (await api.post<Servicio>("/servicios", payload)).data;

export const actualizarServicio = async (id: number, payload: Partial<ServicioInfoPayload>) =>
  (await api.put<Servicio>(`/servicios/${id}`, payload)).data;

/** Corta nuevas reservas del evento; devuelve las reservas futuras que se conservan. */
export const desactivarServicio = async (id: number) =>
  (await api.post<Servicio & ConReservasAfectadas>(`/servicios/${id}/desactivar`)).data;

export const activarServicio = async (id: number) =>
  (await api.post<Servicio & ConReservasAfectadas>(`/servicios/${id}/activar`)).data;
