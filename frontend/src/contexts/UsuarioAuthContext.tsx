import { createContext, useMemo, useState, type ReactNode } from "react";

interface UsuarioAuthState {
  token: string | null;
  nombre: string | null;
  correo: string | null;
  iniciarSesion: (token: string, nombre: string, correo: string) => void;
  cerrarSesion: () => void;
}

export const UsuarioAuthContext = createContext<UsuarioAuthState | undefined>(undefined);

export function UsuarioAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("usuario_token"));
  const [nombre, setNombre] = useState<string | null>(() => localStorage.getItem("usuario_nombre"));
  const [correo, setCorreo] = useState<string | null>(() => localStorage.getItem("usuario_correo"));

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
      cerrarSesion: () => {
        localStorage.removeItem("usuario_token");
        localStorage.removeItem("usuario_nombre");
        localStorage.removeItem("usuario_correo");
        setToken(null);
        setNombre(null);
        setCorreo(null);
      },
    }),
    [token, nombre, correo]
  );

  return <UsuarioAuthContext.Provider value={value}>{children}</UsuarioAuthContext.Provider>;
}
