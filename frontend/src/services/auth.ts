import api from "./api";
import type { TokenResponse } from "../types";

export async function login(usuario: string, password: string): Promise<TokenResponse> {
  const { data } = await api.post<TokenResponse>("/auth/login", { usuario, password });
  return data;
}

/** Cambia la contraseña PROPIA (exige la actual). Devuelve una sesión nueva: hay que
 * guardarla, porque las sesiones abiertas con la contraseña anterior se cierran. */
export async function cambiarPassword(password_actual: string, password_nueva: string, password_confirmacion: string): Promise<TokenResponse> {
  const { data } = await api.post<TokenResponse>("/auth/cambiar-password", { password_actual, password_nueva, password_confirmacion });
  return data;
}
