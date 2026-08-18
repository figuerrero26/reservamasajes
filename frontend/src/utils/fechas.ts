// Toda referencia a "hoy" se ancla explícitamente a America/Bogota (nunca a la zona
// horaria del navegador): el backend es la fuente de verdad para reglas de negocio, esto
// solo se usa para decidir qué semana mostrar por defecto en el calendario.
const ZONA = "America/Bogota";

export function hoyBogota(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date());
}

export function sumarDias(fechaISO: string, dias: number): string {
  const [y, m, d] = fechaISO.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

function diaSemanaISO(fechaISO: string): number {
  const [y, m, d] = fechaISO.split("-").map(Number);
  // getUTCDay(): 0=domingo..6=sábado. Se convierte a 0=lunes..6=domingo.
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return (dow + 6) % 7;
}

export function lunesDeSemana(fechaISO: string): string {
  return sumarDias(fechaISO, -diaSemanaISO(fechaISO));
}

/** Lunes a viernes de la semana que contiene `fechaISO` (o desde `inicio` si se define). */
export function diasHabilesSemana(fechaISO: string): string[] {
  const lunes = lunesDeSemana(fechaISO);
  return [0, 1, 2, 3, 4].map((i) => sumarDias(lunes, i));
}

/** Todos los días entre [inicio, fin] (ambos incluidos, en cualquier orden de la semana —
 * incluye sábados y domingos si están dentro del rango). `maxDias` es un límite de
 * seguridad: cada día dispara una consulta de horarios por agenda, así que un rango mal
 * configurado (por error, años de longitud) no debe intentar traer miles de días. */
export function rangoFechas(inicio: string, fin: string, maxDias = 31): string[] {
  if (fin < inicio) return [];
  const dias: string[] = [];
  let cursor = inicio;
  while (cursor <= fin && dias.length < maxDias) {
    dias.push(cursor);
    cursor = sumarDias(cursor, 1);
  }
  return dias;
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
