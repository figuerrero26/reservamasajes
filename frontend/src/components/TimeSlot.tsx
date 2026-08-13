import { Button, Stack, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import EventBusyIcon from "@mui/icons-material/EventBusy";
import LockIcon from "@mui/icons-material/Lock";
import HistoryToggleOffIcon from "@mui/icons-material/HistoryToggleOff";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import type { Slot } from "../types";
import { formatearHora } from "../utils/fechas";

interface Props {
  slot: Slot;
  seleccionado: boolean;
  onSeleccionar: (slot: Slot) => void;
}

const ESTILO_POR_ESTADO = {
  ocupado: { icon: <EventBusyIcon fontSize="small" />, label: "Ocupado", color: "text.disabled" },
  bloqueado: { icon: <LockIcon fontSize="small" />, label: "Bloqueado", color: "text.disabled" },
  pasado: { icon: <HistoryToggleOffIcon fontSize="small" />, label: "Ya pasó", color: "text.disabled" },
} as const;

export default function TimeSlot({ slot, seleccionado, onSeleccionar }: Props) {
  const hora = formatearHora(slot.hora_inicio);

  if (slot.estado === "disponible" || seleccionado) {
    return (
      <Button
        variant={seleccionado ? "contained" : "outlined"}
        color="primary"
        size="small"
        startIcon={seleccionado ? <CheckCircleIcon /> : <RadioButtonUncheckedIcon />}
        onClick={() => onSeleccionar(slot)}
        aria-pressed={seleccionado}
        sx={{ justifyContent: "flex-start" }}
      >
        <Stack alignItems="flex-start">
          <Typography variant="body2" component="span">{hora}</Typography>
          {seleccionado && <Typography variant="caption" component="span">Seleccionado</Typography>}
        </Stack>
      </Button>
    );
  }

  const estilo = ESTILO_POR_ESTADO[slot.estado];
  return (
    <Button
      variant="outlined"
      size="small"
      disabled
      startIcon={estilo.icon}
      sx={{ justifyContent: "flex-start", color: estilo.color, borderColor: "divider" }}
    >
      <Stack alignItems="flex-start">
        <Typography variant="body2" component="span" sx={{ textDecoration: "line-through" }}>
          {hora}
        </Typography>
        <Typography variant="caption" component="span">{estilo.label}</Typography>
      </Stack>
    </Button>
  );
}
