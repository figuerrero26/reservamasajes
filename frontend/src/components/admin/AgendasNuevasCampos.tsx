import { Box, Button, IconButton, Paper, Stack, TextField, Tooltip, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import type { Area } from "../../types";
import type { AgendaInicialPayload } from "../../services/servicios";
import AreaSelect from "./AreaSelect";
import HorarioCampos, { HORARIO_POR_DEFECTO, errorHorario, horarioAPayload, type HorarioForm } from "./HorarioCampos";

/** Una agenda del evento de reserva que se está creando: lugar (área), espacio o profesional
 * opcional y horario de atención con la duración de los turnos. */
export interface AgendaNueva {
  clave: number;
  areaId: number | "";
  nombre: string;
  horario: HorarioForm;
}

let siguienteClave = 1;
export function agendaNueva(areaId: number | "" = "", horario: HorarioForm = HORARIO_POR_DEFECTO): AgendaNueva {
  siguienteClave += 1;
  return { clave: siguienteClave, areaId, nombre: "", horario: { ...horario, dias: [...horario.dias] } };
}

export function errorAgendasNuevas(agendas: AgendaNueva[]): string | null {
  if (agendas.length === 0) return "Agrega al menos una agenda (lugar y horario de atención).";
  for (const [i, a] of agendas.entries()) {
    const etiqueta = agendas.length > 1 ? ` (agenda ${i + 1})` : "";
    if (a.areaId === "") return `Selecciona el área${etiqueta}.`;
    const error = errorHorario(a.horario);
    if (error) return `${error.replace(/\.$/, "")}${etiqueta}.`;
  }
  const areas = agendas.map((a) => a.areaId);
  if (new Set(areas).size !== areas.length) return "Cada agenda debe estar en un área distinta.";
  return null;
}

export function agendasAPayload(agendas: AgendaNueva[]): AgendaInicialPayload[] {
  return agendas.map((a) => ({
    area_id: a.areaId as number,
    nombre: a.nombre.trim() || null,
    ...horarioAPayload(a.horario),
  }));
}

interface Props {
  valor: AgendaNueva[];
  onChange: (agendas: AgendaNueva[]) => void;
  areas: Area[];
}

/** Agendas con las que nace un evento de reserva: una por área, cada una con su horario de
 * atención, almuerzo, duración de los turnos y días. Después se gestionan desde el mismo
 * evento (pestaña «Agendas y horarios»). */
export default function AgendasNuevasCampos({ valor, onChange, areas }: Props) {
  const usadas = valor.map((a) => a.areaId).filter((id): id is number => id !== "");
  const quedanAreas = areas.some((a) => a.activo && !usadas.includes(a.id));
  const actualizar = (clave: number, cambios: Partial<AgendaNueva>) =>
    onChange(valor.map((a) => (a.clave === clave ? { ...a, ...cambios } : a)));

  return (
    <Stack spacing={2}>
      {valor.map((agenda, i) => (
        <Paper key={agenda.clave} variant="outlined" sx={{ p: { xs: 1.5, sm: 2 } }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
            <Typography variant="subtitle2">{valor.length > 1 ? `Agenda ${i + 1}` : "Agenda"}</Typography>
            {valor.length > 1 && (
              <Tooltip title="Quitar esta agenda">
                <IconButton size="small" aria-label={`Quitar la agenda ${i + 1}`}
                  onClick={() => onChange(valor.filter((a) => a.clave !== agenda.clave))}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <AreaSelect
                  areas={areas} valor={agenda.areaId} label="Área (lugar)"
                  excluir={usadas.filter((id) => id !== agenda.areaId)}
                  onChange={(areaId) => actualizar(agenda.clave, { areaId })}
                />
              </Box>
              <TextField
                label="Espacio o profesional (opcional)" placeholder="Ej.: Sala de bienestar · Terapeuta Ana"
                value={agenda.nombre} onChange={(e) => actualizar(agenda.clave, { nombre: e.target.value })}
                inputProps={{ maxLength: 140 }} sx={{ flex: 1, minWidth: 0 }}
                helperText="Lo ve el colaborador al elegir dónde reservar"
              />
            </Stack>
            <HorarioCampos valor={agenda.horario} onChange={(horario) => actualizar(agenda.clave, { horario })} />
          </Stack>
        </Paper>
      ))}
      {quedanAreas && (
        <Box>
          <Button
            startIcon={<AddIcon />} variant="outlined" size="small"
            onClick={() => onChange([...valor, agendaNueva("", valor[valor.length - 1]?.horario ?? HORARIO_POR_DEFECTO)])}
          >
            Ofrecerlo también en otra área
          </Button>
        </Box>
      )}
    </Stack>
  );
}
