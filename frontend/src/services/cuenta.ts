import apiUsuario from "./apiUsuario";
import type {
  LoginUsuarioRequest, OlvidePasswordRequest, PerfilUsuario, RegistroRequest,
  RestablecerPasswordRequest, TokenUsuarioResponse,
} from "../types";

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

export async function olvidePassword(payload: OlvidePasswordRequest): Promise<void> {
  await apiUsuario.post("/cuenta/olvide-password", payload);
}

export async function restablecerPassword(payload: RestablecerPasswordRequest): Promise<void> {
  await apiUsuario.post("/cuenta/restablecer-password", payload);
}
