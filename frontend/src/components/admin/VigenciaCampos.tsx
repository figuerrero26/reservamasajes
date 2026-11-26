import { Alert, Grid, TextField } from "@mui/material";
import type { HorarioParticipacion } from "../../types";
import { horaBogota, hoyBogota, sumarDias } from "../../utils/fechas";

export interface VigenciaForm {
  inicio: string;
  fin: string;
  publicacion: string;
  apertura: string;
  aperturaReservas: string;
  cierre: string;
}

/** Máximo de días de una vigencia (el mismo tope que valida el backend). */
const MAX_DIAS_VIGENCIA = 731;

export function vigenciaPorDefecto(): VigenciaForm {
  const hoy = hoyBogota();
  return { inicio: hoy, fin: sumarDias(hoy, 6), publicacion: "", apertura: "", aperturaReservas: "", cierre: "" };
}

export function vigenciaDesde(evento: HorarioParticipacion & {
  apertura_reservas_en?: string | null;
  vigencia_inicio?: string | null;
  vigencia_fin?: string | null;
}): VigenciaForm {
  return {
    ...(evento.vigencia_inicio || evento.vigencia_fin
      ? { inicio: evento.vigencia_inicio ?? "", fin: evento.vigencia_fin ?? "" }
      : vigenciaPorDefecto()),
    publicacion: evento.publicacion_en ?? "",
    apertura: evento.hora_apertura ?? "",
    aperturaReservas: evento.apertura_reservas_en ?? "",
    cierre: evento.hora_cierre ?? "",
  };
}

export function horarioDesde(v: VigenciaForm): HorarioParticipacion {
  return {
    publicacion_en: v.publicacion || null,
    hora_apertura: v.apertura || null,
    hora_cierre: v.cierre || null,
  };
}

function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);
}

/** Al crear, una vigencia que ya terminó no tiene sentido; al editar sí se permite (p. ej.
 * para cerrar un evento antes de tiempo). */
export function errorVigencia(v: VigenciaForm, creando: boolean, esReserva = false): string | null {
  if (!v.inicio || !v.fin) return "Define la fecha de inicio y la de finalización del evento.";
  if (v.fin < v.inicio) return "La fecha de finalización debe ser igual o posterior a la de inicio.";
  if (diasEntre(v.inicio, v.fin) + 1 > MAX_DIAS_VIGENCIA) return `La vigencia no puede superar ${MAX_DIAS_VIGENCIA} días.`;
  if (creando && esReserva && !v.aperturaReservas) return "Define la fecha y hora de apertura de reservas.";
  const hora = (valor: string) => valor.length > 5 ? valor : `${valor || "00:00"}:00`;
  const [fechaApertura, horaApertura] = v.aperturaReservas.split("T");
  const dia = fechaApertura || v.inicio;
  if (dia > v.fin || (dia === v.fin && v.cierre && hora(v.cierre) <= hora(horaApertura ?? v.apertura))) {
    return "El cierre debe ser posterior a la apertura.";
  }
  if (creando && v.fin === hoyBogota() && v.cierre && hora(v.cierre) <= hora(horaBogota())) {
    return "La hora de cierre ya pasó.";
  }
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

export default function VigenciaCampos({ valor, onChange, creando, participaciones }: Props) {
  const esReserva = participaciones === "reservas";
  const error = errorVigencia(valor, creando, esReserva);
  const fueraDeOrden = !!valor.inicio && !!valor.fin && valor.fin < valor.inicio;

  return (
    <>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6}>
          <TextField
            label={esReserva ? "Primer día de atención" : "Inscripciones desde"} type="date" required fullWidth
            InputLabelProps={{ shrink: true }}
            value={valor.inicio} onChange={(e) => onChange({ ...valor, inicio: e.target.value })}
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
        <Grid item xs={12} sm={6}>
          <TextField
            label="Publicar desde" type="datetime-local" fullWidth
            InputLabelProps={{ shrink: true }} inputProps={{ step: 1 }}
            value={valor.publicacion} onChange={(e) => onChange({ ...valor, publicacion: e.target.value })}
            helperText="Opcional. Déjalo vacío para publicar el evento al activarlo."
          />
        </Grid>
        {esReserva && (
          <Grid item xs={12} sm={6}>
            <TextField
              label="Fecha y hora de apertura de reservas" type="datetime-local" required={creando} fullWidth
              InputLabelProps={{ shrink: true }} inputProps={{ step: 1 }}
              value={valor.aperturaReservas}
              onChange={(e) => onChange({ ...valor, aperturaReservas: e.target.value })}
              helperText="Hora de Colombia. Puedes abrir las reservas antes o después del primer día de atención."
            />
          </Grid>
        )}
        {!valor.aperturaReservas && (!esReserva || !creando) && <Grid item xs={6} sm={3}>
          <TextField
            label={esReserva ? "Hora de apertura el primer día" : "Hora de apertura"} type="time" fullWidth
            InputLabelProps={{ shrink: true }} inputProps={{ step: 1 }}
            value={valor.apertura} onChange={(e) => onChange({ ...valor, apertura: e.target.value })}
            helperText="Por defecto, 00:00."
          />
        </Grid>}
        <Grid item xs={6} sm={3}>
          <TextField
            label="Hora de cierre" type="time" fullWidth
            InputLabelProps={{ shrink: true }} inputProps={{ step: 1 }}
            value={valor.cierre} onChange={(e) => onChange({ ...valor, cierre: e.target.value })}
            helperText="Por defecto, al terminar el día."
          />
        </Grid>
      </Grid>
      {error && <Alert severity="warning">{error}</Alert>}
    </>
  );
}
