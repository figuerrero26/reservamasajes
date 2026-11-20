import api from "./api";
import apiUsuario from "./apiUsuario";
import type { Inscripcion, InscripcionAdmin, MiInscripcion } from "../types";

type Respuestas = Record<string, string | number | boolean | null>;

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
  correo: string; sesion_id: number; respuestas: Respuestas; notes?: string;
}): Promise<Inscripcion> {
  const { data } = await api.post<Inscripcion>("/inscripciones/manual", payload);
  return data;
}

export async function cancelarInscripcion(id: number): Promise<Inscripcion> {
  const { data } = await api.delete<Inscripcion>(`/inscripciones/${id}`);
  return data;
}

export async function marcarAsistenciaInscripcion(id: number, asistio: boolean): Promise<Inscripcion> {
  const { data } = await api.post<Inscripcion>(`/inscripciones/${id}/asistencia`, { asistio });
  return data;
}
