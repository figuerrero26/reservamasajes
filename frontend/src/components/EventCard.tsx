import { Box, Button, Card, CardActionArea, CardContent, CardMedia, Chip, Stack, Typography, useTheme } from "@mui/material";
import SpaIcon from "@mui/icons-material/Spa";
import PlaceIcon from "@mui/icons-material/Place";
import ScheduleIcon from "@mui/icons-material/Schedule";
import { useNavigate } from "react-router-dom";
import type { EventoPublico } from "../types";
import { useConfig } from "../hooks/useConfig";

interface Props {
  evento: EventoPublico;
}

export default function EventCard({ evento }: Props) {
  const navigate = useNavigate();
  const config = useConfig();
  const theme = useTheme();
  const colorBoton = config.color_boton_disponibilidad || theme.palette.primary.main;

  return (
    <Card variant="outlined" sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <CardActionArea
        onClick={() => navigate(`/eventos/${evento.id}`)}
        sx={{ flexGrow: 1, display: "flex", flexDirection: "column", alignItems: "stretch" }}
      >
        {evento.imagen_url ? (
          <CardMedia component="img" image={evento.imagen_url} alt={evento.nombre} sx={{ height: 160, objectFit: "cover" }} />
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
            {evento.nombre}
          </Typography>
          {evento.descripcion_corta && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {evento.descripcion_corta}
            </Typography>
          )}
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
            <Chip size="small" icon={<ScheduleIcon />} label={`${evento.duracion_minutos} min`} variant="outlined" />
            {evento.areas.length > 0 && (
              <Chip size="small" icon={<PlaceIcon />} label={evento.areas.join(", ")} variant="outlined" />
            )}
          </Stack>
        </CardContent>
      </CardActionArea>
      <Box sx={{ p: 2, pt: 0 }}>
        <Button
          fullWidth
          variant="contained"
          onClick={() => navigate(`/eventos/${evento.id}`)}
          sx={{
            bgcolor: colorBoton,
            color: theme.palette.getContrastText(colorBoton),
            "&:hover": { bgcolor: colorBoton, opacity: 0.9 },
          }}
        >
          Ver disponibilidad
        </Button>
      </Box>
    </Card>
  );
}
