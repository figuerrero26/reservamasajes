import type { ReactNode } from "react";
import { Box, Stack, Typography } from "@mui/material";

interface Props {
  titulo: string;
  descripcion?: ReactNode;
  /** Texto pequeño en mayúsculas sobre el título (sección / contexto). */
  antetitulo?: string;
  acciones?: ReactNode;
}

/** Encabezado de página uniforme: jerarquía clara (antetítulo → título → descripción) y las
 * acciones principales alineadas a la derecha (abajo en móvil). */
export default function PageHeader({ titulo, descripcion, antetitulo, acciones }: Props) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      justifyContent="space-between"
      alignItems={{ xs: "flex-start", sm: "flex-end" }}
      spacing={2}
      sx={{ mb: { xs: 3, sm: 4 } }}
    >
      <Box sx={{ minWidth: 0 }}>
        {antetitulo && (
          <Typography variant="overline" color="text.secondary" component="p">
            {antetitulo}
          </Typography>
        )}
        <Typography variant="h4" component="h1">
          {titulo}
        </Typography>
        {descripcion && (
          <Typography variant="body1" color="text.secondary" sx={{ mt: 0.75, maxWidth: 680 }}>
            {descripcion}
          </Typography>
        )}
      </Box>
      {acciones && (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ flexShrink: 0 }}>
          {acciones}
        </Stack>
      )}
    </Stack>
  );
}
