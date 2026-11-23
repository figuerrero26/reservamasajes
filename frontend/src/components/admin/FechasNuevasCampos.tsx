import { Box, Button, Grid, IconButton, Paper, Stack, TextField, Tooltip, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import type { SesionPayload } from "../../services/actividades";
import { hoyBogota, horaBogota } from "../../utils/fechas";

/** Una fecha de realización del evento de inscripción que se está creando. */
export interface FechaNueva {
  clave: number;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  lugar: string;
  /** Límite de participantes; vacío = sin límite. */
  cupo: string;
}

let siguienteClave = 1;
export function fechaNueva(base?: Partial<FechaNueva>): FechaNueva {
  siguienteClave += 1;
  return { fecha: "", horaInicio: "", horaFin: "", lugar: "", cupo: "", ...base, clave: siguienteClave };
}

export function errorFechasNuevas(fechas: FechaNueva[], inicioInscripciones: string): string | null {
  if (fechas.length === 0) return "Agrega al menos una fecha de realización.";
  const hoy = hoyBogota();
  const ahora = horaBogota();
  const vistas = new Set<string>();
  for (const [i, f] of fechas.entries()) {
    const etiqueta = fechas.length > 1 ? ` (fecha ${i + 1})` : "";
    if (!f.fecha || !f.horaInicio || !f.horaFin) return `Completa el día y el horario de realización${etiqueta}.`;
    if (f.horaFin <= f.horaInicio) return `La hora de fin debe ser posterior a la de inicio${etiqueta}.`;
    if (f.fecha < hoy || (f.fecha === hoy && f.horaInicio <= ahora)) return `La fecha ya pasó${etiqueta}.`;
    if (inicioInscripciones && f.fecha < inicioInscripciones) {
      return `La fecha${etiqueta} es anterior al inicio de las inscripciones: nadie podría inscribirse.`;
    }
    if (f.cupo.trim() && !(Number.isInteger(Number(f.cupo)) && Number(f.cupo) >= 1)) {
      return `El límite de participantes debe ser un número mayor que cero${etiqueta}.`;
    }
    const clave = `${f.fecha} ${f.horaInicio}`;
    if (vistas.has(clave)) return "Hay dos fechas con el mismo día y hora de inicio.";
    vistas.add(clave);
  }
  return null;
}

export function fechasAPayload(fechas: FechaNueva[]): SesionPayload[] {
  return fechas.map((f) => ({
    fecha: f.fecha, hora_inicio: f.horaInicio, hora_fin: f.horaFin,
    cupo_maximo: f.cupo.trim() ? Number(f.cupo) : null, lugar: f.lugar.trim() || null,
  }));
}

/** Fecha y horario de realización, lugar y límite de participantes de cada fecha del evento
 * de inscripción. Después se gestionan desde el mismo evento («Fechas, cupos e inscritos»). */
export default function FechasNuevasCampos({ valor, onChange }: { valor: FechaNueva[]; onChange: (f: FechaNueva[]) => void }) {
  const actualizar = (clave: number, cambios: Partial<FechaNueva>) =>
    onChange(valor.map((f) => (f.clave === clave ? { ...f, ...cambios } : f)));
  const hoy = hoyBogota();

  return (
    <Stack spacing={1.5}>
      {valor.map((f, i) => (
        <Paper key={f.clave} variant="outlined" sx={{ p: { xs: 1.5, sm: 2 } }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
            <Typography variant="subtitle2">{valor.length > 1 ? `Fecha ${i + 1}` : "Fecha"}</Typography>
            {valor.length > 1 && (
              <Tooltip title="Quitar esta fecha">
                <IconButton size="small" aria-label={`Quitar la fecha ${i + 1}`} onClick={() => onChange(valor.filter((x) => x.clave !== f.clave))}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
          <Grid container spacing={1.5}>
            <Grid item xs={12} sm={4}>
              <TextField label="Día" type="date" size="small" fullWidth required InputLabelProps={{ shrink: true }}
                inputProps={{ min: hoy }} value={f.fecha} onChange={(e) => actualizar(f.clave, { fecha: e.target.value })} />
            </Grid>
            <Grid item xs={6} sm={4}>
              <TextField label="Hora inicio" type="time" size="small" fullWidth required InputLabelProps={{ shrink: true }}
                value={f.horaInicio} onChange={(e) => actualizar(f.clave, { horaInicio: e.target.value })} />
            </Grid>
            <Grid item xs={6} sm={4}>
              <TextField label="Hora fin" type="time" size="small" fullWidth required InputLabelProps={{ shrink: true }}
                value={f.horaFin} onChange={(e) => actualizar(f.clave, { horaFin: e.target.value })}
                error={!!f.horaFin && !!f.horaInicio && f.horaFin <= f.horaInicio} />
            </Grid>
            <Grid item xs={12} sm={7}>
              <TextField label="Lugar o punto de encuentro" size="small" fullWidth inputProps={{ maxLength: 200 }}
                value={f.lugar} onChange={(e) => actualizar(f.clave, { lugar: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={5}>
              <TextField label="Límite de participantes" helperText="Vacío = sin límite" type="number" size="small" fullWidth
                inputProps={{ min: 1 }} value={f.cupo} onChange={(e) => actualizar(f.clave, { cupo: e.target.value })} />
            </Grid>
          </Grid>
        </Paper>
      ))}
      <Box>
        <Button
          startIcon={<AddIcon />} variant="outlined" size="small"
          onClick={() => {
            const ultima = valor[valor.length - 1];
            onChange([...valor, fechaNueva(ultima ? { horaInicio: ultima.horaInicio, horaFin: ultima.horaFin, lugar: ultima.lugar, cupo: ultima.cupo } : {})]);
          }}
        >
          Agregar otra fecha
        </Button>
      </Box>
    </Stack>
  );
}
