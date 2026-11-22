import type { ReactNode } from "react";
import { Box, Paper, Typography } from "@mui/material";

interface Props {
  titulo: string;
  descripcion?: ReactNode;
  children: ReactNode;
  ancho?: number;
}

/** Contenedor común de las pantallas de acceso (login, registro, restablecer contraseña). */
export default function AuthCard({ titulo, descripcion, children, ancho = 420 }: Props) {
  return (
    <Box sx={{ display: "flex", justifyContent: "center", py: { xs: 1, sm: 4 } }}>
      <Paper variant="outlined" sx={{ width: "100%", maxWidth: ancho, p: { xs: 3, sm: 5 } }}>
        <Typography variant="h4" component="h1" sx={{ fontSize: "1.75rem" }}>
          {titulo}
        </Typography>
        {descripcion && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {descripcion}
          </Typography>
        )}
        <Box sx={{ mt: 3 }}>{children}</Box>
      </Paper>
    </Box>
  );
}

/** Solo rutas internas de la aplicación: evita que `?next=` redirija fuera del sitio o rompa
 * la navegación con valores como "//otro-sitio" o "https://...". */
export function destinoSeguro(next: string | null, porDefecto = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return porDefecto;
  return next;
}
