import { useEffect, useState } from "react";
import { Alert, Box, CircularProgress, Grid, Paper, Stack, Typography, useMediaQuery, useTheme } from "@mui/material";
import type { Slot } from "../types";
import { obtenerHorarios } from "../services/reservas";
import { mensajeError } from "../utils/errors";
import { formatearFecha, nombreDia } from "../utils/fechas";
import DaySelector from "./DaySelector";
import TimeSlot from "./TimeSlot";

interface Props {
  agendaId: number;
  dias: string[];
  slotSeleccionado: { fecha: string; slot: Slot } | null;
  onSeleccionarSlot: (fecha: string, slot: Slot) => void;
}

type SlotsPorDia = Record<string, Slot[] | "cargando" | "error">;

export default function WeekCalendar({ agendaId, dias, slotSeleccionado, onSeleccionarSlot }: Props) {
  const theme = useTheme();
  const esEscritorio = useMediaQuery(theme.breakpoints.up("md"));
  const [slotsPorDia, setSlotsPorDia] = useState<SlotsPorDia>({});
  const [diaMovil, setDiaMovil] = useState(dias[0]);

  useEffect(() => {
    setDiaMovil(dias[0]);
    setSlotsPorDia(Object.fromEntries(dias.map((d) => [d, "cargando" as const])));
    dias.forEach((fecha) => {
      obtenerHorarios(agendaId, fecha)
        .then((r) => setSlotsPorDia((prev) => ({ ...prev, [fecha]: r.slots })))
        .catch(() => setSlotsPorDia((prev) => ({ ...prev, [fecha]: "error" })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agendaId, dias.join(",")]);

  function renderDia(fecha: string) {
    const slots = slotsPorDia[fecha];
    if (slots === "cargando" || slots === undefined) {
      return <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}><CircularProgress size={24} /></Box>;
    }
    if (slots === "error") {
      return <Alert severity="error">{mensajeError(null, "No se pudieron cargar los horarios")}</Alert>;
    }
    if (slots.length === 0) {
      return <Typography variant="body2" color="text.secondary">Sin horarios disponibles</Typography>;
    }
    return (
      <Stack spacing={1}>
        {slots.map((s) => (
          <TimeSlot
            key={s.hora_inicio}
            slot={s}
            seleccionado={slotSeleccionado?.fecha === fecha && slotSeleccionado.slot.hora_inicio === s.hora_inicio}
            onSeleccionar={(slot) => onSeleccionarSlot(fecha, slot)}
          />
        ))}
      </Stack>
    );
  }

  if (esEscritorio) {
    return (
      <Grid container spacing={2}>
        {dias.map((fecha) => (
          <Grid item xs key={fecha} sx={{ minWidth: 0 }}>
            <Paper variant="outlined" sx={{ p: 1.5, height: "100%" }}>
              <Typography variant="subtitle2" align="center" gutterBottom>
                {nombreDia(fecha)}
              </Typography>
              <Typography variant="caption" display="block" align="center" color="text.secondary" sx={{ mb: 1.5 }}>
                {formatearFecha(fecha)}
              </Typography>
              {renderDia(fecha)}
            </Paper>
          </Grid>
        ))}
      </Grid>
    );
  }

  // Mobile first: un día a la vez, sin scroll horizontal de tabla.
  return (
    <Box>
      <DaySelector dias={dias} seleccionado={diaMovil} onSeleccionar={setDiaMovil} />
      {renderDia(diaMovil)}
    </Box>
  );
}
