import { AxiosError } from "axios";
import type { ApiErrorBody, ReservaAdmin } from "../types";

/** Mensaje legible para el usuario a partir de cualquier error de la API.
 * - Errores de negocio: `{ detail: "texto" }`.
 * - Validación de FastAPI (422): `{ detail: [{ msg, loc }] }` — se toma el primer mensaje.
 * - Sin respuesta (servidor caído / sin red): mensaje de conexión. */
export function mensajeError(e: unknown, fallback = "Ocurrió un error. Intente de nuevo."): string {
  if (e instanceof AxiosError) {
    if (!e.response) return "No se pudo conectar con el servidor. Revise su conexión e intente de nuevo.";
    const cuerpo = e.response.data as ApiErrorBody | undefined;
    const detail = cuerpo?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail[0]?.msg) {
      return detail[0].msg.replace(/^Value error, /, "");
    }
    if (e.response.status === 429) return "Demasiados intentos seguidos. Espere un minuto e intente de nuevo.";
  }
  return fallback;
}

export function esConflicto(e: unknown): boolean {
  return e instanceof AxiosError && e.response?.status === 409;
}

/** Reservas que impidieron una operación (409 al editar una agenda), si las hay. */
export function reservasAfectadasDe(e: unknown): ReservaAdmin[] {
  if (e instanceof AxiosError) {
    const cuerpo = e.response?.data as ApiErrorBody | undefined;
    return cuerpo?.reservas_afectadas ?? [];
  }
  return [];
}
