import { FormControlLabel, MenuItem, Radio, RadioGroup, Stack, TextField, Typography } from "@mui/material";
import type { PeriodoLimite } from "../../types";

export type TipoEvento = "turnos" | "actividad";

export interface ReglaForm {
  /** null = sin límite (solo actividades; en turnos siempre rige una por día). */
  limite: number | null;
  periodo: PeriodoLimite;
}

type Preset = "una_por_dia" | "una_vez" | "sin_limite" | "personalizado";

const PERIODOS: { valor: PeriodoLimite; texto: string }[] = [
  { valor: "dia", texto: "por día" },
  { valor: "semana", texto: "por semana" },
  { valor: "mes", texto: "por mes" },
  { valor: "evento", texto: "durante toda la vigencia" },
];

export function reglaPorDefecto(tipo: TipoEvento): ReglaForm {
  return tipo === "turnos" ? { limite: 1, periodo: "dia" } : { limite: null, periodo: "evento" };
}

export function reglaDesde(tipo: TipoEvento, limite?: number | null, periodo?: PeriodoLimite | null): ReglaForm {
  if (periodo == null) return reglaPorDefecto(tipo);
  return { limite: limite ?? null, periodo };
}

function presetDe(r: ReglaForm, tipo: TipoEvento): Preset {
  if (r.limite == null) return tipo === "turnos" ? "una_por_dia" : "sin_limite";
  if (r.limite === 1 && r.periodo === "dia") return "una_por_dia";
  if (r.limite === 1 && r.periodo === "evento") return "una_vez";
  return "personalizado";
}

export function errorRegla(r: ReglaForm, tipo: TipoEvento): string | null {
  if (r.limite != null && (!Number.isInteger(r.limite) || r.limite < 1 || r.limite > 100)) {
    return "El límite debe ser un número entero entre 1 y 100.";
  }
  if (tipo === "turnos" && r.periodo === "dia" && r.limite != null && r.limite > 1) {
    return "En los eventos por turnos cada persona tiene como máximo una reserva por día: usa otro periodo.";
  }
  return null;
}

/** La regla en palabras: misma redacción que el backend (app/utils/vigencia.py). */
export function describirRegla(r: ReglaForm, tipo: TipoEvento): string {
  const singular = tipo === "turnos" ? "reserva" : "inscripción";
  const plural = tipo === "turnos" ? "reservas" : "inscripciones";
  if (r.limite == null) {
    return tipo === "turnos"
      ? "Una reserva por persona por día; puedes repetir en días diferentes."
      : "Sin límite de inscripciones por persona (una por sesión).";
  }
  const alcance = PERIODOS.find((p) => p.valor === r.periodo)?.texto ?? "";
  if (r.limite === 1) {
    if (r.periodo === "evento") return `Una sola ${singular} por persona durante toda la vigencia del evento.`;
    if (r.periodo === "dia") return `Una ${singular} por persona por día; puedes repetir en días diferentes.`;
    return `Una ${singular} por persona ${alcance}.`;
  }
  return `Hasta ${r.limite} ${plural} por persona ${alcance}${tipo === "turnos" ? ", en días distintos" : ""}.`;
}

interface Props {
  tipo: TipoEvento;
  valor: ReglaForm;
  onChange: (r: ReglaForm) => void;
}

/** Restricción de participación propia del evento (reemplaza la antigua restricción global
 * "evento único por semana"). La valida el backend contando el historial NO cancelado de cada
 * persona (lo que ya ocurrió también cuenta); el administrador puede habilitar excepciones
 * por colaborador. */
export default function ReglaParticipacionCampo({ tipo, valor, onChange }: Props) {
  const preset = presetDe(valor, tipo);
  const periodosPersonalizados = tipo === "turnos" ? PERIODOS.filter((p) => p.valor !== "dia") : PERIODOS;
  const error = errorRegla(valor, tipo);

  function elegir(p: Preset) {
    if (p === "una_por_dia") onChange({ limite: 1, periodo: "dia" });
    else if (p === "una_vez") onChange({ limite: 1, periodo: "evento" });
    else if (p === "sin_limite") onChange({ limite: null, periodo: "evento" });
    else onChange({ limite: 2, periodo: tipo === "turnos" ? "semana" : "evento" });
  }

  const opciones: { valor: Preset; texto: string }[] = tipo === "turnos"
    ? [
        { valor: "una_por_dia", texto: "Una reserva por día — puede repetir en días diferentes" },
        { valor: "una_vez", texto: "Una sola vez durante toda la vigencia" },
        { valor: "personalizado", texto: "Límite personalizado por persona" },
      ]
    : [
        { valor: "sin_limite", texto: "Sin límite — en todas las sesiones que quiera (una vez por sesión)" },
        { valor: "una_vez", texto: "Una sola vez durante toda la vigencia" },
        { valor: "una_por_dia", texto: "Una inscripción por día — puede repetir en días diferentes" },
        { valor: "personalizado", texto: "Límite personalizado por persona" },
      ];

  return (
    <Stack spacing={1.5}>
      <RadioGroup value={preset} onChange={(e) => elegir(e.target.value as Preset)}>
        {opciones.map((o) => (
          <FormControlLabel key={o.valor} value={o.valor} control={<Radio size="small" />}
            label={<Typography variant="body2">{o.texto}</Typography>} />
        ))}
      </RadioGroup>
      {preset === "personalizado" && (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ pl: { sm: 4 } }}>
          <TextField
            label="Máximo por persona" type="number" size="small" inputProps={{ min: 1, max: 100 }} sx={{ width: { sm: 190 } }}
            value={valor.limite == null || Number.isNaN(valor.limite) ? "" : valor.limite}
            // Vacío mientras se escribe = NaN (lo marca errorRegla), nunca "sin límite".
            onChange={(e) => onChange({ ...valor, limite: e.target.value === "" ? NaN : Math.trunc(Number(e.target.value)) })}
          />
          <TextField select label="Periodo" size="small" sx={{ minWidth: 220 }} value={valor.periodo}
            onChange={(e) => onChange({ ...valor, periodo: e.target.value as PeriodoLimite })}>
            {periodosPersonalizados.map((p) => <MenuItem key={p.valor} value={p.valor}>{p.texto}</MenuItem>)}
          </TextField>
        </Stack>
      )}
      <Typography variant="caption" color={error ? "error" : "text.secondary"}>
        {error ?? `${describirRegla(valor, tipo)} Las cancelaciones no cuentan; lo que ya ocurrió, sí.`}
      </Typography>
    </Stack>
  );
}
