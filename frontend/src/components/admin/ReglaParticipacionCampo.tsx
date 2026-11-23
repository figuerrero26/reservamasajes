import { FormControlLabel, MenuItem, Radio, RadioGroup, Stack, TextField, Typography } from "@mui/material";
import type { PeriodoLimite } from "../../types";

/** Los dos tipos de evento del sistema (ver backend/app/schemas/tipo_evento.py). */
export type TipoEvento = "reserva" | "inscripcion";

export interface ReglaForm {
  /** null = sin límite (solo inscripciones; en reservas siempre rige una por día). */
  limite: number | null;
  periodo: PeriodoLimite;
}

type Preset = "una_por_dia" | "una_vez" | "sin_limite" | "personalizado";

export function reglaPorDefecto(tipo: TipoEvento): ReglaForm {
  return tipo === "reserva" ? { limite: 1, periodo: "dia" } : { limite: null, periodo: "evento" };
}

export function reglaDesde(tipo: TipoEvento, limite?: number | null, periodo?: PeriodoLimite | null): ReglaForm {
  if (periodo == null) return reglaPorDefecto(tipo);
  return { limite: limite ?? null, periodo };
}

function presetDe(r: ReglaForm, tipo: TipoEvento): Preset {
  if (r.limite == null) return tipo === "reserva" ? "una_por_dia" : "sin_limite";
  if (tipo === "reserva" && r.limite === 1 && r.periodo === "dia") return "una_por_dia";
  if (r.limite === 1 && r.periodo === "evento") return "una_vez";
  return "personalizado";
}

export function errorRegla(r: ReglaForm, tipo: TipoEvento): string | null {
  if (r.limite != null && (!Number.isInteger(r.limite) || r.limite < 1 || r.limite > 100)) {
    return "El máximo debe ser un número entero entre 1 y 100.";
  }
  if (tipo === "reserva" && r.periodo === "dia" && r.limite != null && r.limite > 1) {
    return "En los eventos de reserva cada persona tiene como máximo una reserva por día: usa otro periodo.";
  }
  return null;
}

const POR_PERIODO: Record<PeriodoLimite, string> = { dia: "por día", semana: "por semana", mes: "por mes", evento: "" };

/** La regla en palabras: misma redacción que el backend (describir_regla_reserva y
 * describir_regla_inscripcion). */
export function describirRegla(r: ReglaForm, tipo: TipoEvento): string {
  if (tipo === "reserva") {
    if (r.limite == null || (r.limite === 1 && r.periodo === "dia")) {
      return "Una reserva por persona por día; puedes repetir en días diferentes.";
    }
    if (r.limite === 1) {
      return r.periodo === "evento"
        ? "Una sola reserva por persona durante toda la vigencia del evento."
        : `Una reserva por persona ${POR_PERIODO[r.periodo]}.`;
    }
    const alcance = r.periodo === "evento" ? "durante toda la vigencia del evento" : POR_PERIODO[r.periodo];
    return `Hasta ${r.limite} reservas por persona ${alcance}, en días distintos.`;
  }
  if (r.limite == null) return "Sin límite por persona: puedes inscribirte en todas las fechas que quieras (una vez en cada una).";
  if (r.limite === 1) {
    return r.periodo === "evento"
      ? "Una sola inscripción por persona: puedes participar en una de las fechas de esta actividad."
      : `Una inscripción por persona ${POR_PERIODO[r.periodo]}.`;
  }
  return r.periodo === "evento"
    ? `Hasta ${r.limite} inscripciones por persona en esta actividad (una por fecha).`
    : `Hasta ${r.limite} inscripciones por persona ${POR_PERIODO[r.periodo]}.`;
}

interface Props {
  tipo: TipoEvento;
  valor: ReglaForm;
  onChange: (r: ReglaForm) => void;
}

/** Restricciones de participación propias del tipo de evento:
 * - Reserva: cuántos turnos puede reservar cada persona (siempre como máximo uno por día).
 * - Inscripción: en cuántas fechas (sesiones) puede inscribirse cada persona.
 * Las valida el backend contando el historial NO cancelado de cada persona (lo que ya ocurrió
 * también cuenta); el administrador puede habilitar excepciones por colaborador. */
export default function ReglaParticipacionCampo({ tipo, valor, onChange }: Props) {
  const preset = presetDe(valor, tipo);
  const error = errorRegla(valor, tipo);

  function elegir(p: Preset) {
    if (p === "una_por_dia") onChange({ limite: 1, periodo: "dia" });
    else if (p === "una_vez") onChange({ limite: 1, periodo: "evento" });
    else if (p === "sin_limite") onChange({ limite: null, periodo: "evento" });
    else onChange({ limite: 2, periodo: tipo === "reserva" ? "semana" : "evento" });
  }

  const opciones: { valor: Preset; texto: string }[] = tipo === "reserva"
    ? [
        { valor: "una_por_dia", texto: "Una reserva por día — puede volver a reservar otros días" },
        { valor: "una_vez", texto: "Una sola reserva durante todas las fechas del evento" },
        { valor: "personalizado", texto: "Un número máximo de reservas por persona" },
      ]
    : [
        { valor: "sin_limite", texto: "Sin límite — puede inscribirse en todas las fechas (una vez en cada una)" },
        { valor: "una_vez", texto: "Solo una fecha por persona" },
        { valor: "personalizado", texto: "Un número máximo de fechas por persona" },
      ];

  const periodos: { valor: PeriodoLimite; texto: string }[] = tipo === "reserva"
    ? [
        { valor: "semana", texto: "por semana" },
        { valor: "mes", texto: "por mes" },
        { valor: "evento", texto: "en todas las fechas del evento" },
      ]
    : [
        { valor: "evento", texto: "en toda la actividad" },
        { valor: "semana", texto: "por semana" },
        { valor: "mes", texto: "por mes" },
        { valor: "dia", texto: "por día" },
      ];

  return (
    <Stack spacing={1.5}>
      <RadioGroup value={preset} onChange={(e) => elegir(e.target.value as Preset)}>
        {opciones.map((o) => (
          <FormControlLabel key={o.valor} value={o.valor} control={<Radio size="small" />}
            label={<Typography variant="body2">{o.texto}</Typography>} sx={{ alignItems: "flex-start", "& .MuiRadio-root": { pt: 0.5 }, my: 0.25 }} />
        ))}
      </RadioGroup>
      {preset === "personalizado" && (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ pl: { sm: 4 } }}>
          <TextField
            label={tipo === "reserva" ? "Máximo de reservas" : "Máximo de fechas"} type="number" size="small"
            inputProps={{ min: 1, max: 100 }} sx={{ width: { sm: 190 } }}
            value={valor.limite == null || Number.isNaN(valor.limite) ? "" : valor.limite}
            // Vacío mientras se escribe = NaN (lo marca errorRegla), nunca "sin límite".
            onChange={(e) => onChange({ ...valor, limite: e.target.value === "" ? NaN : Math.trunc(Number(e.target.value)) })}
          />
          <TextField select label="Periodo" size="small" sx={{ minWidth: 220 }} value={valor.periodo}
            onChange={(e) => onChange({ ...valor, periodo: e.target.value as PeriodoLimite })}>
            {periodos.map((p) => <MenuItem key={p.valor} value={p.valor}>{p.texto}</MenuItem>)}
          </TextField>
        </Stack>
      )}
      <Typography variant="caption" color={error ? "error" : "text.secondary"}>
        {error ?? `${describirRegla(valor, tipo)} Las cancelaciones no cuentan; lo que ya ocurrió, sí.`}
      </Typography>
    </Stack>
  );
}
