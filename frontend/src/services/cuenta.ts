import apiUsuario from "./apiUsuario";
import type { LoginUsuarioRequest, PerfilUsuario, RegistroRequest, TokenUsuarioResponse } from "../types";

export async function registrarse(payload: RegistroRequest): Promise<TokenUsuarioResponse> {
  const { data } = await apiUsuario.post<TokenUsuarioResponse>("/cuenta/registro", payload);
  return data;
}

export async function iniciarSesionUsuario(payload: LoginUsuarioRequest): Promise<TokenUsuarioResponse> {
  const { data } = await apiUsuario.post<TokenUsuarioResponse>("/cuenta/login", payload);
  return data;
}

export async function obtenerPerfil(): Promise<PerfilUsuario> {
  const { data } = await apiUsuario.get<PerfilUsuario>("/cuenta/me");
  return data;
}
