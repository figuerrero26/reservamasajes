import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { EVENTO_SESION_USUARIO_EXPIRADA } from "../services/apiUsuario";

interface UsuarioAuthState {
  token: string | null;
  nombre: string | null;
  correo: string | null;
  iniciarSesion: (token: string, nombre: string, correo: string) => void;
  cerrarSesion: () => void;
}

export const UsuarioAuthContext = createContext<UsuarioAuthState | undefined>(undefined);

const CLAVES = ["usuario_token", "usuario_nombre", "usuario_correo"] as const;

export function UsuarioAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("usuario_token"));
  const [nombre, setNombre] = useState<string | null>(() => localStorage.getItem("usuario_nombre"));
  const [correo, setCorreo] = useState<string | null>(() => localStorage.getItem("usuario_correo"));

  const cerrarSesion = useCallback(() => {
    CLAVES.forEach((c) => localStorage.removeItem(c));
    setToken(null);
    setNombre(null);
    setCorreo(null);
  }, []);

  // Si el backend rechaza el token (expirado o cuenta bloqueada), la interfaz refleja de
  // inmediato que ya no hay sesión, sin esperar a que el usuario recargue la página.
  useEffect(() => {
    window.addEventListener(EVENTO_SESION_USUARIO_EXPIRADA, cerrarSesion);
    return () => window.removeEventListener(EVENTO_SESION_USUARIO_EXPIRADA, cerrarSesion);
  }, [cerrarSesion]);

  const value = useMemo<UsuarioAuthState>(
    () => ({
      token,
      nombre,
      correo,
      iniciarSesion: (t, n, c) => {
        localStorage.setItem("usuario_token", t);
        localStorage.setItem("usuario_nombre", n);
        localStorage.setItem("usuario_correo", c);
        setToken(t);
        setNombre(n);
        setCorreo(c);
      },
      cerrarSesion,
    }),
    [token, nombre, correo, cerrarSesion]
  );

  return <UsuarioAuthContext.Provider value={value}>{children}</UsuarioAuthContext.Provider>;
}
