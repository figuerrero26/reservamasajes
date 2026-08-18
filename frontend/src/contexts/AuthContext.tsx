import { createContext, useMemo, useState, type ReactNode } from "react";

interface AuthState {
  token: string | null;
  nombre: string | null;
  rol: string | null;
  iniciarSesion: (token: string, nombre: string, rol: string) => void;
  cerrarSesion: () => void;
}

export const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("token"));
  const [nombre, setNombre] = useState<string | null>(() => localStorage.getItem("nombre"));
  const [rol, setRol] = useState<string | null>(() => localStorage.getItem("rol"));

  const value = useMemo<AuthState>(
    () => ({
      token,
      nombre,
      rol,
      iniciarSesion: (t, n, r) => {
        localStorage.setItem("token", t);
        localStorage.setItem("nombre", n);
        localStorage.setItem("rol", r);
        setToken(t);
        setNombre(n);
        setRol(r);
      },
      cerrarSesion: () => {
        localStorage.removeItem("token");
        localStorage.removeItem("nombre");
        localStorage.removeItem("rol");
        setToken(null);
        setNombre(null);
        setRol(null);
      },
    }),
    [token, nombre, rol]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
