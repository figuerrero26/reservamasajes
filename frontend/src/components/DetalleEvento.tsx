import type { ReactNode } from "react";
import { Box, Paper, Stack, Typography } from "@mui/material";

export interface FilaDetalle {
  icono: ReactNode;
  titulo: string;
  contenido: ReactNode;
}

/** Ficha de datos del detalle de un evento en el portal: solo la información que le sirve
 * al colaborador según el tipo de evento (reserva o inscripción), en filas con ícono. */
export default function DetalleEvento({ filas, titulo = "Detalles" }: { filas: FilaDetalle[]; titulo?: string }) {
  const visibles = filas.filter((f) => f.contenido != null && f.contenido !== "");
  if (visibles.length === 0) return null;
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 } }}>
      <Typography variant="overline" color="text.secondary" component="h2" sx={{ display: "block", mb: 1 }}>
        {titulo}
      </Typography>
      <Stack spacing={1.75}>
        {visibles.map((f) => (
          <Stack key={f.titulo} direction="row" spacing={1.5} alignItems="flex-start">
            <Box sx={{ color: "primary.main", display: "flex", mt: "1px", flexShrink: 0, "& svg": { fontSize: 20 } }}>{f.icono}</Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.4 }}>{f.titulo}</Typography>
              <Box sx={{ typography: "body2", color: "text.primary", wordBreak: "break-word" }}>{f.contenido}</Box>
            </Box>
          </Stack>
        ))}
      </Stack>
    </Paper>
  );
}
