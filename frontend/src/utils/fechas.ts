// Toda referencia a "hoy" se ancla explícitamente a America/Bogota (nunca a la zona horaria
// del navegador). Los días reservables los calcula el backend (GET /semana/dias-reservables);
// aquí solo hay utilidades de presentación.
const ZONA = "America/Bogota";

export function hoyBogota(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date());
}

function diaSemanaISO(fechaISO: string): number {
  const [y, m, d] = fechaISO.split("-").map(Number);
  // getUTCDay(): 0=domingo..6=sábado. Se convierte a 0=lunes..6=domingo.
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return (dow + 6) % 7;
}

const NOMBRES_DIA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const NOMBRES_MES = [
  "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic",
];

export function nombreDia(fechaISO: string): string {
  return NOMBRES_DIA[diaSemanaISO(fechaISO)];
}

export function formatearFecha(fechaISO: string): string {
  const [, m, d] = fechaISO.split("-").map(Number);
  return `${d} ${NOMBRES_MES[m - 1]}`;
}

export function formatearHora(horaISO: string): string {
  return horaISO.slice(0, 5);
}

const MESES_LARGOS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
  "septiembre", "octubre", "noviembre", "diciembre",
];

/** "Lunes 24 de noviembre" (sin depender del locale del navegador). */
export function formatearFechaLarga(fechaISO: string): string {
  const [, m, d] = fechaISO.slice(0, 10).split("-").map(Number);
  return `${nombreDia(fechaISO.slice(0, 10))} ${d} de ${MESES_LARGOS[m - 1]}`;
}

/** "24 nov · 10:00" a partir de un datetime ISO local ("2026-11-24T10:00:00"). */
export function formatearFechaHora(datetimeISO: string): string {
  return `${formatearFecha(datetimeISO.slice(0, 10))} · ${datetimeISO.slice(11, 16)}`;
}

/** Descarga un CSV (UTF-8 con BOM, para que Excel respete las tildes). */
export function descargarCSV(nombreArchivo: string, encabezados: string[], filas: (string | number | null | undefined)[][]) {
  const escapar = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const contenido = [encabezados, ...filas].map((f) => f.map(escapar).join(";")).join("\r\n");
  const blob = new Blob(["﻿" + contenido], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}
