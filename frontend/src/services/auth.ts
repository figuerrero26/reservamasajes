import api from "./api";
import type { TokenResponse } from "../types";

export async function login(usuario: string, password: string): Promise<TokenResponse> {
  const { data } = await api.post<TokenResponse>("/auth/login", { usuario, password });
  return data;
}

export async function cambiarPassword(password_actual: string, password_nueva: string): Promise<void> {
  await api.post("/auth/cambiar-password", { password_actual, password_nueva });
}
