import { createContext, useMemo, useState, type ReactNode } from "react";

interface AuthState {
  token: string | null;
  nombre: string | null;
  iniciarSesion: (token: string, nombre: string) => void;
  cerrarSesion: () => void;
}

export const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("token"));
  const [nombre, setNombre] = useState<string | null>(() => localStorage.getItem("nombre"));

  const value = useMemo<AuthState>(
    () => ({
      token,
      nombre,
      iniciarSesion: (t, n) => {
        localStorage.setItem("token", t);
        localStorage.setItem("nombre", n);
        setToken(t);
        setNombre(n);
      },
      cerrarSesion: () => {
        localStorage.removeItem("token");
        localStorage.removeItem("nombre");
        setToken(null);
        setNombre(null);
      },
    }),
    [token, nombre]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
