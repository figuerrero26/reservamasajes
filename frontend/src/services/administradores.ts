import api from "./api";
import type { Administrador } from "../types";

export const listarAdministradores = async () =>
  (await api.get<Administrador[]>("/administradores")).data;

export const crearAdministrador = async (usuario: string, nombre: string, password: string, rol: string) =>
  (await api.post<Administrador>("/administradores", { usuario, nombre, password, rol })).data;

/** Contraseña nueva para OTRA cuenta administrativa (solo rol con acceso total). Sus sesiones
 * abiertas se cierran y la operación queda en la auditoría. */
export const restablecerPasswordAdministrador = async (id: number, password_nueva: string, password_confirmacion: string) =>
  (await api.post<Administrador>(`/administradores/${id}/password`, { password_nueva, password_confirmacion })).data;

export const desactivarAdministrador = async (id: number) =>
  (await api.post<Administrador>(`/administradores/${id}/desactivar`)).data;

export const activarAdministrador = async (id: number) =>
  (await api.post<Administrador>(`/administradores/${id}/activar`)).data;

export const eliminarAdministrador = async (id: number) =>
  api.delete(`/administradores/${id}`);
