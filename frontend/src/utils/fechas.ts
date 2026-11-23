// Toda referencia a "hoy" se ancla explícitamente a America/Bogota (nunca a la zona horaria
// del navegador). Los días reservables de cada evento los calcula el backend (detalle del
// evento, `dias_reservables`); aquí solo hay utilidades de presentación.
const ZONA = "America/Bogota";

export function hoyBogota(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date());
}

/** Hora actual en Bogotá, "HH:MM" (para comparar con horas de turnos "HH:MM:SS"). */
export function horaBogota(): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}

/** Suma días a una fecha ISO (AAAA-MM-DD), sin depender de la zona del navegador. */
export function sumarDias(fechaISO: string, dias: number): string {
  const [y, m, d] = fechaISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
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

/** "24 nov" o, si no es del año actual, "24 nov 2027". */
function fechaCorta(fechaISO: string): string {
  const anio = fechaISO.slice(0, 4);
  return anio === hoyBogota().slice(0, 4) ? formatearFecha(fechaISO) : `${formatearFecha(fechaISO)} ${anio}`;
}

/** Vigencia de un evento en pocas palabras: "Del 24 nov al 5 dic", "Hasta el 5 dic"… */
export function textoVigencia(inicio?: string | null, fin?: string | null): string | null {
  if (inicio && fin) return inicio === fin ? `El ${fechaCorta(inicio)}` : `Del ${fechaCorta(inicio)} al ${fechaCorta(fin)}`;
  if (fin) return `Hasta el ${fechaCorta(fin)}`;
  if (inicio) return `Desde el ${fechaCorta(inicio)}`;
  return null;
}

/** Fechas de un evento en lenguaje natural, para el detalle del portal:
 * "Del lunes 23 al viernes 27 de noviembre", "Del lunes 30 de noviembre al viernes 4 de
 * diciembre", "El lunes 23 de noviembre" (con el año solo si no es el actual). */
export function textoFechasLargas(inicio?: string | null, fin?: string | null): string | null {
  const conAnio = (f: string) => (f.slice(0, 4) === hoyBogota().slice(0, 4) ? "" : ` de ${f.slice(0, 4)}`);
  const larga = (f: string) => `${formatearFechaLarga(f).toLowerCase()}${conAnio(f)}`;
  if (inicio && fin) {
    if (inicio === fin) return `El ${larga(inicio)}`;
    const mismoMes = inicio.slice(0, 7) === fin.slice(0, 7);
    if (mismoMes) {
      const [, , d] = inicio.split("-").map(Number);
      return `Del ${nombreDia(inicio).toLowerCase()} ${d} al ${larga(fin)}`;
    }
    return `Del ${larga(inicio)} al ${larga(fin)}`;
  }
  if (fin) return `Hasta el ${larga(fin)}`;
  if (inicio) return `Desde el ${larga(inicio)}`;
  return null;
}

const DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** "0,1,2,3,4" → "Lunes a viernes"; "0,2,4" → "Lun, Mié, Vie". */
export function resumenDiasSemana(csv?: string | null): string {
  const dias = (csv ?? "").split(",").map(Number).filter((d) => !Number.isNaN(d) && d >= 0 && d <= 6).sort((a, b) => a - b);
  const clave = dias.join(",");
  if (clave === "0,1,2,3,4") return "Lunes a viernes";
  if (clave === "0,1,2,3,4,5") return "Lunes a sábado";
  if (clave === "0,1,2,3,4,5,6") return "Todos los días";
  if (dias.length > 2 && dias.every((d, i) => i === 0 || d === dias[i - 1] + 1)) {
    return `${NOMBRES_DIA[dias[0]]} a ${NOMBRES_DIA[dias[dias.length - 1]].toLowerCase()}`;
  }
  return dias.map((d) => DIAS_CORTOS[d]).join(", ");
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
