import { useEffect, useState } from "react";
import { Alert, Box, CircularProgress, Paper, Stack, Typography, useMediaQuery, useTheme } from "@mui/material";
import type { Slot } from "../types";
import { obtenerHorarios } from "../services/reservas";
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
  const claveDias = dias.join(",");

  useEffect(() => {
    let vigente = true;
    setDiaMovil(dias[0]);
    setSlotsPorDia(Object.fromEntries(dias.map((d) => [d, "cargando" as const])));
    dias.forEach((fecha) => {
      obtenerHorarios(agendaId, fecha)
        .then((r) => vigente && setSlotsPorDia((prev) => ({ ...prev, [fecha]: r.slots })))
        .catch(() => vigente && setSlotsPorDia((prev) => ({ ...prev, [fecha]: "error" })));
    });
    return () => {
      vigente = false; // evita pintar respuestas de una agenda anterior si el usuario cambió de área
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agendaId, claveDias]);

  function renderDia(fecha: string) {
    const slots = slotsPorDia[fecha];
    if (slots === "cargando" || slots === undefined) {
      return <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}><CircularProgress size={22} /></Box>;
    }
    if (slots === "error") {
      return <Alert severity="error" sx={{ fontSize: "0.8rem" }}>No se pudieron cargar los horarios.</Alert>;
    }
    if (slots.length === 0) {
      return <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 2 }}>Sin horarios</Typography>;
    }
    const disponibles = slots.filter((s) => s.estado === "disponible").length;
    return (
      <>
        <Typography variant="caption" color="text.secondary" display="block" align="center" sx={{ mb: 1 }}>
          {disponibles > 0 ? `${disponibles} disponible(s)` : "Completo"}
        </Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: esEscritorio ? "1fr" : "repeat(auto-fill, minmax(88px, 1fr))", gap: 1 }}>
          {slots.map((s) => (
            <TimeSlot
              key={s.hora_inicio}
              slot={s}
              seleccionado={slotSeleccionado?.fecha === fecha && slotSeleccionado.slot.hora_inicio === s.hora_inicio}
              onSeleccionar={(slot) => onSeleccionarSlot(fecha, slot)}
            />
          ))}
        </Box>
      </>
    );
  }

  if (esEscritorio) {
    return (
      <Box sx={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(dias.length, 7)}, minmax(0, 1fr))`, gap: 1.5, overflowX: "auto" }}>
        {dias.map((fecha) => (
          <Paper key={fecha} variant="outlined" sx={{ p: 1.5, minWidth: 0 }}>
            <Stack alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="subtitle2">{nombreDia(fecha)}</Typography>
              <Typography variant="caption" color="text.secondary">{formatearFecha(fecha)}</Typography>
            </Stack>
            {renderDia(fecha)}
          </Paper>
        ))}
      </Box>
    );
  }

  // Móvil: un día a la vez, sin desplazamiento horizontal de tabla.
  return (
    <Box>
      <DaySelector dias={dias} seleccionado={diaMovil} onSeleccionar={setDiaMovil} />
      {renderDia(diaMovil)}
    </Box>
  );
}
