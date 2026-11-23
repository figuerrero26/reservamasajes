import { Box, Chip, Grid, Stack, TextField, Typography } from "@mui/material";
import type { Agenda } from "../../types";

/** Campos del horario de una agenda (atención, almuerzo, duración del turno y días). Los
 * comparten el alta de un evento por turnos y el formulario de agendas, con las mismas
 * validaciones que aplica el backend (ver backend/app/schemas/agenda.py). */
export interface HorarioForm {
  hora_inicio: string;
  hora_fin: string;
  almuerzo_inicio: string;
  almuerzo_fin: string;
  duracion_minutos: string;
  dias: number[];
}

export const HORARIO_POR_DEFECTO: HorarioForm = {
  hora_inicio: "08:00", hora_fin: "17:00", almuerzo_inicio: "12:00", almuerzo_fin: "13:00",
  duracion_minutos: "30", dias: [0, 1, 2, 3, 4],
};

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const minutos = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export function horarioDesdeAgenda(a: Agenda): HorarioForm {
  return {
    hora_inicio: a.hora_inicio.slice(0, 5),
    hora_fin: a.hora_fin.slice(0, 5),
    almuerzo_inicio: a.almuerzo_inicio?.slice(0, 5) ?? "",
    almuerzo_fin: a.almuerzo_fin?.slice(0, 5) ?? "",
    duracion_minutos: String(a.duracion_minutos),
    dias: a.dias_habilitados.split(",").map(Number).filter((d) => !Number.isNaN(d)),
  };
}

/** Primer problema del horario, o null si es válido. */
export function errorHorario(h: HorarioForm): string | null {
  if (!h.hora_inicio || !h.hora_fin) return "Define la hora de inicio y de fin.";
  if (h.hora_fin <= h.hora_inicio) return "La hora de fin debe ser posterior a la de inicio.";
  const dur = Number(h.duracion_minutos);
  if (!Number.isInteger(dur) || dur < 5 || dur > 480) return "La duración del turno debe estar entre 5 y 480 minutos.";
  if (minutos(h.hora_fin) - minutos(h.hora_inicio) < dur) return "El horario es más corto que un turno.";
  if (!!h.almuerzo_inicio !== !!h.almuerzo_fin) return "Define el inicio y el fin del almuerzo, o deja ambos vacíos.";
  if (h.almuerzo_inicio && h.almuerzo_fin) {
    if (h.almuerzo_fin <= h.almuerzo_inicio) return "El fin del almuerzo debe ser posterior a su inicio.";
    if (h.almuerzo_inicio < h.hora_inicio || h.almuerzo_fin > h.hora_fin) return "El almuerzo debe quedar dentro del horario.";
  }
  if (h.dias.length === 0) return "Elige al menos un día de atención.";
  return null;
}

export function horarioAPayload(h: HorarioForm) {
  return {
    hora_inicio: h.hora_inicio,
    hora_fin: h.hora_fin,
    almuerzo_inicio: h.almuerzo_inicio || null,
    almuerzo_fin: h.almuerzo_fin || null,
    duracion_minutos: Number(h.duracion_minutos),
    dias_habilitados: [...h.dias].sort((a, b) => a - b).join(","),
  };
}

/** Cuántos turnos genera el horario por día (vista previa para el administrador). */
export function turnosPorDia(h: HorarioForm): number {
  if (errorHorario(h)) return 0;
  const dur = Number(h.duracion_minutos);
  let total = 0;
  for (let c = minutos(h.hora_inicio); c + dur <= minutos(h.hora_fin); c += dur) {
    const almuerzo = h.almuerzo_inicio && h.almuerzo_fin && c < minutos(h.almuerzo_fin) && minutos(h.almuerzo_inicio) < c + dur;
    if (!almuerzo) total += 1;
  }
  return total;
}

export default function HorarioCampos({ valor, onChange }: { valor: HorarioForm; onChange: (h: HorarioForm) => void }) {
  const set = (cambios: Partial<HorarioForm>) => onChange({ ...valor, ...cambios });
  const error = errorHorario(valor);
  const turnos = turnosPorDia(valor);

  return (
    <Box>
      <Grid container spacing={2}>
        <Grid item xs={6} sm={3}>
          <TextField label="Atención desde" type="time" fullWidth InputLabelProps={{ shrink: true }}
            value={valor.hora_inicio} onChange={(e) => set({ hora_inicio: e.target.value })} />
        </Grid>
        <Grid item xs={6} sm={3}>
          <TextField label="Hasta" type="time" fullWidth InputLabelProps={{ shrink: true }}
            value={valor.hora_fin} onChange={(e) => set({ hora_fin: e.target.value })} />
        </Grid>
        <Grid item xs={6} sm={3}>
          <TextField label="Almuerzo desde" type="time" fullWidth InputLabelProps={{ shrink: true }}
            value={valor.almuerzo_inicio} onChange={(e) => set({ almuerzo_inicio: e.target.value })} helperText="Opcional" />
        </Grid>
        <Grid item xs={6} sm={3}>
          <TextField label="Almuerzo hasta" type="time" fullWidth InputLabelProps={{ shrink: true }}
            value={valor.almuerzo_fin} onChange={(e) => set({ almuerzo_fin: e.target.value })} />
        </Grid>
        <Grid item xs={12} sm={4}>
          <TextField
            label="Duración del turno (min)" type="number" fullWidth inputProps={{ min: 5, max: 480, step: 5 }}
            value={valor.duracion_minutos} onChange={(e) => set({ duracion_minutos: e.target.value })}
          />
        </Grid>
        <Grid item xs={12} sm={8}>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>Días de atención</Typography>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
            {DIAS.map((d, i) => {
              const elegido = valor.dias.includes(i);
              return (
                <Chip
                  key={d}
                  label={d}
                  color={elegido ? "primary" : "default"}
                  variant={elegido ? "filled" : "outlined"}
                  onClick={() => set({ dias: elegido ? valor.dias.filter((x) => x !== i) : [...valor.dias, i] })}
                />
              );
            })}
          </Stack>
        </Grid>
      </Grid>
      <Typography variant="caption" sx={{ display: "block", mt: 1.5, color: error ? "error.main" : "text.secondary" }}>
        {error ?? `${turnos} turno(s) por día de atención.`}
      </Typography>
    </Box>
  );
}
