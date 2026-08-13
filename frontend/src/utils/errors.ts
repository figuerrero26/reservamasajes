import { AxiosError } from "axios";
import type { ApiErrorBody } from "../types";

export function mensajeError(e: unknown, fallback = "Ocurrió un error. Intente de nuevo."): string {
  if (e instanceof AxiosError) {
    const detail = (e.response?.data as ApiErrorBody | undefined)?.detail;
    if (typeof detail === "string") return detail;
  }
  return fallback;
}

export function esConflicto(e: unknown): boolean {
  return e instanceof AxiosError && e.response?.status === 409;
}
