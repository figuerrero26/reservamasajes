import type { ReactNode } from "react";
import { Box, Typography } from "@mui/material";
import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";

interface Props {
  titulo: string;
  descripcion?: ReactNode;
  icono?: ReactNode;
  accion?: ReactNode;
}

/** Pantalla vacía consistente: qué pasa y, si aplica, qué puede hacer el usuario. */
export default function EmptyState({ titulo, descripcion, icono, accion }: Props) {
  return (
    <Box
      sx={{
        textAlign: "center", py: { xs: 6, sm: 8 }, px: 3,
        border: 1, borderColor: "divider", borderStyle: "dashed", borderRadius: 4, bgcolor: "background.paper",
      }}
    >
      <Box sx={{ color: "text.disabled", mb: 1.5, "& svg": { fontSize: 40 } }}>{icono ?? <InboxOutlinedIcon />}</Box>
      <Typography variant="h6" gutterBottom>
        {titulo}
      </Typography>
      {descripcion && (
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420, mx: "auto" }}>
          {descripcion}
        </Typography>
      )}
      {accion && <Box sx={{ mt: 2.5 }}>{accion}</Box>}
    </Box>
  );
}
