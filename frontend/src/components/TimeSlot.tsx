import { Button, Tooltip } from "@mui/material";
import type { Slot } from "../types";
import { formatearHora } from "../utils/fechas";

interface Props {
  slot: Slot;
  seleccionado: boolean;
  onSeleccionar: (slot: Slot) => void;
}

const MOTIVO: Record<Exclude<Slot["estado"], "disponible">, string> = {
  ocupado: "Ocupado",
  bloqueado: "No disponible",
  pasado: "Ya pasó",
};

/** Un horario del calendario: disponible (seleccionable) o atenuado con su motivo. */
export default function TimeSlot({ slot, seleccionado, onSeleccionar }: Props) {
  const hora = formatearHora(slot.hora_inicio);

  if (slot.estado === "disponible" || seleccionado) {
    return (
      <Button
        variant={seleccionado ? "contained" : "outlined"}
        color={seleccionado ? "primary" : "inherit"}
        onClick={() => onSeleccionar(slot)}
        aria-pressed={seleccionado}
        aria-label={`Reservar a las ${hora}`}
        fullWidth
        sx={{ borderRadius: 2, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}
      >
        {hora}
      </Button>
    );
  }

  return (
    <Tooltip title={MOTIVO[slot.estado]} placement="top">
      <span>
        <Button
          variant="outlined"
          disabled
          fullWidth
          aria-label={`${hora}: ${MOTIVO[slot.estado]}`}
          sx={{ borderRadius: 2, fontVariantNumeric: "tabular-nums", textDecoration: "line-through", borderStyle: "dashed" }}
        >
          {hora}
        </Button>
      </span>
    </Tooltip>
  );
}
