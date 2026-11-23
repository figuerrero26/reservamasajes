import api from "./api";
import apiUsuario from "./apiUsuario";
import type { Actividad, ActividadPublica, CampoFormulario, Sesion } from "../types";
import type { VigenciaPayload } from "./servicios";

// ---- Portal público (sin autenticación) ----
export async function listarActividadesPublicas(): Promise<ActividadPublica[]> {
  const { data } = await apiUsuario.get<ActividadPublica[]>("/actividades/publicas");
  return data;
}

export async function obtenerActividadPublica(id: number): Promise<ActividadPublica> {
  const { data } = await apiUsuario.get<ActividadPublica>(`/actividades/publicas/${id}`);
  return data;
}

export async function listarSesionesPublicas(actividadId: number): Promise<Sesion[]> {
  const { data } = await apiUsuario.get<Sesion[]>(`/actividades/publicas/${actividadId}/sesiones`);
  return data;
}

// ---- Administración ----
export interface ActividadPayload extends VigenciaPayload {
  area_id: number;
  nombre: string;
  descripcion_corta?: string | null;
  descripcion_larga?: string | null;
  imagen_url?: string | null;
  informacion_adicional?: string | null;
  campos_formulario: CampoFormulario[];
  inscripcion_abierta: boolean;
}

export async function listarActividades(): Promise<Actividad[]> {
  const { data } = await api.get<Actividad[]>("/actividades");
  return data;
}

/** Crea el evento de inscripción (área obligatoria) y sus fechas de realización (sesiones) en
 * la misma operación. `tipo: "inscripcion"`: el backend rechaza configuraciones de reserva. */
export async function crearActividad(payload: ActividadPayload & { sesiones?: SesionPayload[] }): Promise<Actividad> {
  const { data } = await api.post<Actividad>("/actividades", { tipo: "inscripcion", ...payload });
  return data;
}

export async function actualizarActividad(id: number, payload: Partial<ActividadPayload> & { activo?: boolean }): Promise<Actividad> {
  const { data } = await api.put<Actividad>(`/actividades/${id}`, { tipo: "inscripcion", ...payload });
  return data;
}

export async function desactivarActividad(id: number): Promise<Actividad> {
  const { data } = await api.post<Actividad>(`/actividades/${id}/desactivar`);
  return data;
}

export async function activarActividad(id: number): Promise<Actividad> {
  const { data } = await api.post<Actividad>(`/actividades/${id}/activar`);
  return data;
}

export interface SesionPayload {
  fecha: string; hora_inicio: string; hora_fin: string; cupo_maximo?: number | null; lugar?: string | null;
}

export async function listarSesiones(actividadId: number): Promise<Sesion[]> {
  const { data } = await api.get<Sesion[]>(`/actividades/${actividadId}/sesiones`);
  return data;
}

export async function crearSesion(actividadId: number, payload: SesionPayload): Promise<Sesion> {
  const { data } = await api.post<Sesion>(`/actividades/${actividadId}/sesiones`, payload);
  return data;
}

export async function generarSesiones(actividadId: number, payload: {
  fecha_inicio: string; fecha_fin: string; dias_semana: number[];
  hora_inicio: string; hora_fin: string; cupo_maximo?: number | null; lugar?: string | null;
}): Promise<Sesion[]> {
  const { data } = await api.post<Sesion[]>(`/actividades/${actividadId}/sesiones/generar`, payload);
  return data;
}

export async function actualizarSesion(sesionId: number, payload: Partial<SesionPayload> & { activa?: boolean }): Promise<Sesion> {
  const { data } = await api.put<Sesion>(`/actividades/sesiones/${sesionId}`, payload);
  return data;
}

export async function desactivarSesion(sesionId: number): Promise<Sesion> {
  const { data } = await api.post<Sesion>(`/actividades/sesiones/${sesionId}/desactivar`);
  return data;
}
