import api from "./api";
import type { ConReservasAfectadas, PeriodoLimite, Servicio } from "../types";

/** Eventos por turnos. Con `areaId`, solo los que tienen agenda en esa área. */
export const listarServicios = async (areaId?: number) =>
  (await api.get<Servicio[]>("/servicios", { params: areaId ? { area_id: areaId } : {} })).data;

/** Vigencia y regla de participación, comunes a los eventos por turnos y a las actividades. */
export interface VigenciaPayload {
  vigencia_inicio: string;
  vigencia_fin: string;
  limite_participaciones: number | null;
  periodo_limite: PeriodoLimite;
}

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

/** Crea el evento de reserva junto con sus agendas (una por área), su vigencia y su regla, en
 * una sola operación. `tipo: "reserva"`: el backend rechaza configuraciones de inscripción. */
export const crearServicio = async (payload: ServicioInfoPayload & VigenciaPayload & { agendas: AgendaInicialPayload[] }) =>
  (await api.post<Servicio>("/servicios", { tipo: "reserva", ...payload })).data;

/** Si se acorta la vigencia, `reservas_afectadas` trae las reservas futuras que quedaron fuera
 * del nuevo periodo (se conservan: el administrador decide si las cancela). */
export const actualizarServicio = async (id: number, payload: Partial<ServicioInfoPayload & VigenciaPayload>) =>
  (await api.put<Servicio & ConReservasAfectadas>(`/servicios/${id}`, { tipo: "reserva", ...payload })).data;

/** Corta nuevas reservas del evento; devuelve las reservas futuras que se conservan. */
export const desactivarServicio = async (id: number) =>
  (await api.post<Servicio & ConReservasAfectadas>(`/servicios/${id}/desactivar`)).data;

export const activarServicio = async (id: number) =>
  (await api.post<Servicio & ConReservasAfectadas>(`/servicios/${id}/activar`)).data;

/** Borra el evento de verdad (irreversible): también sus agendas y reservas. */
export const eliminarServicio = async (id: number) =>
  (await api.delete<{ agendas_eliminadas: number; reservas_eliminadas: number }>(`/servicios/${id}`)).data;
