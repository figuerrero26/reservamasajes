import { useContext } from "react";
import { UsuarioAuthContext } from "../contexts/UsuarioAuthContext";

export function useUsuarioAuth() {
  const ctx = useContext(UsuarioAuthContext);
  if (!ctx) throw new Error("useUsuarioAuth debe usarse dentro de <UsuarioAuthProvider>");
  return ctx;
}
