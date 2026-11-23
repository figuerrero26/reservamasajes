/** Datos públicos del token de sesión del panel (identificador y usuario de la cuenta), solo
 * para la interfaz: p. ej. marcar la fila propia en «Administradores». La validación real
 * del token la hace siempre el backend. */
export function datosDelToken(token: string | null): { id: number | null; usuario: string | null } {
  if (!token) return { id: null, usuario: null };
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64).split("").map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`).join(""),
    );
    const datos = JSON.parse(json) as { id?: number; sub?: string };
    return { id: typeof datos.id === "number" ? datos.id : null, usuario: datos.sub ?? null };
  } catch {
    return { id: null, usuario: null };
  }
}
