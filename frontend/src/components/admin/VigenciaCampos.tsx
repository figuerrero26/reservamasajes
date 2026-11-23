import { Alert, Grid, TextField } from "@mui/material";
import type { EstadoVigencia } from "../../types";
import { formatearFechaLarga, hoyBogota, sumarDias } from "../../utils/fechas";

export interface VigenciaForm {
  inicio: string;
  fin: string;
}

/** Máximo de días de una vigencia (el mismo tope que valida el backend). */
const MAX_DIAS_VIGENCIA = 731;

export function vigenciaPorDefecto(): VigenciaForm {
  const hoy = hoyBogota();
  return { inicio: hoy, fin: sumarDias(hoy, 6) };
}

export function vigenciaDesde(inicio?: string | null, fin?: string | null): VigenciaForm {
  return inicio || fin ? { inicio: inicio ?? "", fin: fin ?? "" } : vigenciaPorDefecto();
}

function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);
}

/** Misma regla que el backend (app/utils/vigencia.py): ambos días incluidos. */
export function estadoDeVigencia(v: VigenciaForm, hoy = hoyBogota()): EstadoVigencia {
  if (!v.inicio && !v.fin) return "sin_vigencia";
  if (v.inicio && hoy < v.inicio) return "proximo";
  if (v.fin && hoy > v.fin) return "finalizado";
  return "vigente";
}

/** Al crear, una vigencia que ya terminó no tiene sentido; al editar sí se permite (p. ej.
 * para cerrar un evento antes de tiempo). */
export function errorVigencia(v: VigenciaForm, creando: boolean): string | null {
  if (!v.inicio || !v.fin) return "Define la fecha de inicio y la de finalización del evento.";
  if (v.fin < v.inicio) return "La fecha de finalización debe ser igual o posterior a la de inicio.";
  if (diasEntre(v.inicio, v.fin) + 1 > MAX_DIAS_VIGENCIA) return `La vigencia no puede superar ${MAX_DIAS_VIGENCIA} días.`;
  if (creando && v.fin < hoyBogota()) return "La fecha de finalización ya pasó: define una vigencia actual o futura.";
  return null;
}

interface Props {
  valor: VigenciaForm;
  onChange: (v: VigenciaForm) => void;
  creando: boolean;
  /** "reservas" (eventos por turnos) o "inscripciones" (actividades). */
  participaciones: "reservas" | "inscripciones";
}

/** Vigencia del evento: periodo en que se publica en el portal y recibe participaciones. En
 * un evento de reserva son las fechas en que se atiende (los turnos se ofrecen dentro de
 * ellas); en uno de inscripción es el periodo de inscripción (la realización la definen sus
 * fechas). Al terminar se cierra solo (lo controla el backend con la fecha de Bogotá, aunque
 * nadie entre al panel) y conserva todo su historial. */
export default function VigenciaCampos({ valor, onChange, creando, participaciones }: Props) {
  const error = errorVigencia(valor, creando);
  const estado = estadoDeVigencia(valor);
  const fueraDeOrden = !!valor.inicio && !!valor.fin && valor.fin < valor.inicio;
  const esReserva = participaciones === "reservas";

  return (
    <>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6}>
          <TextField
            label={esReserva ? "Primer día de atención" : "Inscripciones desde"} type="date" required fullWidth
            InputLabelProps={{ shrink: true }}
            value={valor.inicio} onChange={(e) => onChange({ ...valor, inicio: e.target.value })}
            helperText={esReserva ? "Desde este día se publica y se puede reservar" : "Desde este día se publica y recibe inscripciones"}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            label={esReserva ? "Último día de atención" : "Inscripciones hasta"} type="date" required fullWidth
            InputLabelProps={{ shrink: true }}
            value={valor.fin} onChange={(e) => onChange({ ...valor, fin: e.target.value })}
            inputProps={{ min: valor.inicio || undefined }}
            error={fueraDeOrden}
            helperText={fueraDeOrden ? "Debe ser igual o posterior al inicio" : esReserva ? "Último día con turnos (incluido)" : "Último día para inscribirse (incluido)"}
          />
        </Grid>
      </Grid>
      {error ? (
        <Alert severity="warning">{error}</Alert>
      ) : estado === "proximo" ? (
        <Alert severity="info">
          Próximo: se publicará y empezará a recibir {participaciones} el {formatearFechaLarga(valor.inicio).toLowerCase()}.
        </Alert>
      ) : estado === "finalizado" ? (
        <Alert severity="info">
          Finalizado: ya no recibe {participaciones} nuevas. Las existentes y su historial se conservan.
        </Alert>
      ) : (
        <Alert severity="success">
          Vigente: recibe {participaciones} hasta el {formatearFechaLarga(valor.fin).toLowerCase()}, inclusive. Después se
          cierra solo, sin cancelar ni modificar las {participaciones} que ya existan.
        </Alert>
      )}
    </>
  );
}
