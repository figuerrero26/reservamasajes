import type { ReactElement } from "react";
import { Box, Button, Card, CardActionArea, CardContent, CardMedia, Chip, Stack, Typography, useTheme } from "@mui/material";
import SpaIcon from "@mui/icons-material/Spa";
import { useNavigate } from "react-router-dom";
import { useConfig } from "../hooks/useConfig";

export interface ChipTarjeta {
  icon?: ReactElement;
  label: string;
  color?: "default" | "success" | "warning";
}

interface Props {
  titulo: string;
  descripcionCorta?: string | null;
  imagenUrl?: string | null;
  chips?: ChipTarjeta[];
  ruta: string;
  textoBoton?: string;
}

/** Tarjeta de catálogo del portal público — compartida por eventos reservables (masajes) y
 * actividades con inscripción, para que ambos se vean igual en la pantalla de inicio. */
export default function EventCard({ titulo, descripcionCorta, imagenUrl, chips = [], ruta, textoBoton = "Ver disponibilidad" }: Props) {
  const navigate = useNavigate();
  const config = useConfig();
  const theme = useTheme();
  const colorBoton = config.color_boton_disponibilidad || theme.palette.primary.main;

  return (
    <Card variant="outlined" sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <CardActionArea
        onClick={() => navigate(ruta)}
        sx={{ flexGrow: 1, display: "flex", flexDirection: "column", alignItems: "stretch" }}
      >
        {imagenUrl ? (
          <CardMedia component="img" image={imagenUrl} alt={titulo} sx={{ height: 160, objectFit: "cover" }} />
        ) : (
          <Box
            sx={{
              height: 160,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: "primary.main",
              color: "primary.contrastText",
            }}
          >
            <SpaIcon sx={{ fontSize: 48, opacity: 0.85 }} />
          </Box>
        )}
        <CardContent sx={{ flexGrow: 1, width: "100%" }}>
          <Typography variant="h6" gutterBottom>
            {titulo}
          </Typography>
          {descripcionCorta && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {descripcionCorta}
            </Typography>
          )}
          {chips.length > 0 && (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
              {chips.map((c, i) => (
                <Chip
                  key={i}
                  size="small"
                  icon={c.icon}
                  label={c.label}
                  color={c.color}
                  variant={c.color ? "filled" : "outlined"}
                />
              ))}
            </Stack>
          )}
        </CardContent>
      </CardActionArea>
      <Box sx={{ p: 2, pt: 0 }}>
        <Button
          fullWidth
          variant="contained"
          onClick={() => navigate(ruta)}
          sx={{
            bgcolor: colorBoton,
            color: theme.palette.getContrastText(colorBoton),
            "&:hover": { bgcolor: colorBoton, opacity: 0.9 },
          }}
        >
          {textoBoton}
        </Button>
      </Box>
    </Card>
  );
}
