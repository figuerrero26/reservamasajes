import api from "./api";
import type { Usuario } from "../types";

export const buscarUsuarios = async (params: { nombre?: string; correo?: string }) =>
  (await api.get<Usuario[]>("/usuarios", { params })).data;

export const desactivarUsuario = async (id: number) =>
  (await api.post<Usuario>(`/usuarios/${id}/desactivar`)).data;

export const activarUsuario = async (id: number) =>
  (await api.post<Usuario>(`/usuarios/${id}/activar`)).data;

export const resetearPasswordUsuario = async (id: number, password_nueva: string) =>
  (await api.post<Usuario>(`/usuarios/${id}/resetear-password`, { password_nueva })).data;

export const setReservasMultiples = async (id: number, permitir: boolean) =>
  api.post(`/usuarios/${id}/reservas-multiples`, null, { params: { permitir } });
