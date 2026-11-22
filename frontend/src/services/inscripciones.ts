import api from "./api";
import apiUsuario from "./apiUsuario";
import type { Inscripcion, InscripcionAdmin, MiInscripcion } from "../types";

export type Respuestas = Record<string, string | number | boolean | null>;

// ---- Portal público (requiere sesión de usuario) ----
export async function crearInscripcion(sesionId: number, respuestas: Respuestas): Promise<Inscripcion> {
  const { data } = await apiUsuario.post<Inscripcion>("/inscripciones", { sesion_id: sesionId, respuestas });
  return data;
}

export async function misInscripciones(): Promise<MiInscripcion[]> {
  const { data } = await apiUsuario.get<MiInscripcion[]>("/inscripciones/mias");
  return data;
}

export async function cancelarInscripcionPropia(id: number): Promise<Inscripcion> {
  const { data } = await apiUsuario.post<Inscripcion>(`/inscripciones/${id}/cancelar`);
  return data;
}

// ---- Administración ----
export async function buscarInscripciones(params: {
  nombre?: string; correo?: string; actividad_id?: number; sesion_id?: number; estado?: string;
}): Promise<InscripcionAdmin[]> {
  const { data } = await api.get<InscripcionAdmin[]>("/inscripciones", { params });
  return data;
}

export async function crearInscripcionManual(payload: {
  correo: string; sesion_id: number; respuestas?: Respuestas; notes?: string;
}): Promise<Inscripcion> {
  const { data } = await api.post<Inscripcion>("/inscripciones/manual", { respuestas: {}, ...payload });
  return data;
}

/** Cancelación administrativa. Por defecto avisa al participante por correo. */
export async function cancelarInscripcion(
  id: number, opciones: { motivo?: string | null; notificar?: boolean } = {},
): Promise<Inscripcion> {
  const { data } = await api.post<Inscripcion>(`/inscripciones/${id}/cancelar-admin`, {
    motivo: opciones.motivo || null, notificar: opciones.notificar ?? true,
  });
  return data;
}

export async function marcarAsistenciaInscripcion(id: number, asistio: boolean): Promise<Inscripcion> {
  const { data } = await api.post<Inscripcion>(`/inscripciones/${id}/asistencia`, { asistio });
  return data;
}
