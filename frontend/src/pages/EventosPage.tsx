import { useEffect, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Alert, Box, Button, Grid, Paper, Typography, useTheme } from "@mui/material";
import EventCard from "../components/EventCard";
import Loader from "../components/Loader";
import MutedVideo from "../components/MutedVideo";
import type { EventoPublico } from "../types";
import { listarEventos } from "../services/eventos";
import { mensajeError } from "../utils/errors";
import { esVideo } from "../utils/media";
import { useConfig } from "../hooks/useConfig";
import { useUsuarioAuth } from "../hooks/useUsuarioAuth";

export default function EventosPage() {
  const config = useConfig();
  const { token } = useUsuarioAuth();
  const theme = useTheme();
  const colorFondoBienvenida = config.color_fondo_bienvenida || theme.palette.primary.main;
  const [eventos, setEventos] = useState<EventoPublico[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listarEventos()
      .then(setEventos)
      .catch((e) => setError(mensajeError(e, "No se pudieron cargar los eventos disponibles.")))
      .finally(() => setCargando(false));
  }, []);

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        ✨ ¡Relájate y disfruta la Semana! 🌿
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>

      </Typography>

      {!token && (
        <Alert
          severity="info"
          sx={{ mb: 3 }}
          action={
            <Button color="inherit" size="small" component={RouterLink} to="/registro">
              Registrarse
            </Button>
          }
        >
          ¿Aún no tienes cuenta? Regístrate para agendar tu masaje.
        </Alert>
      )}

      {config.mensaje_bienvenida && (
        <Paper
          elevation={0}
          sx={{
            p: { xs: 3, sm: 4 },
            mb: config.imagen_bienvenida_url ? 2 : 3,
            borderRadius: 2,
            textAlign: "center",
            bgcolor: colorFondoBienvenida,
            color: theme.palette.getContrastText(colorFondoBienvenida),
          }}
        >
          <Typography variant="body1" sx={{ whiteSpace: "pre-line" }}>
            {config.mensaje_bienvenida}
          </Typography>
        </Paper>
      )}

      {config.imagen_bienvenida_url && (
        <Box sx={{ textAlign: "center", mb: 3 }}>
          {esVideo(config.imagen_bienvenida_url) ? (
            <MutedVideo
              src={config.imagen_bienvenida_url}
              sx={{ maxWidth: "100%", maxHeight: 280, borderRadius: 2 }}
            />
          ) : (
            <Box
              component="img"
              src={config.imagen_bienvenida_url}
              alt=""
              sx={{ maxWidth: "100%", maxHeight: 280, borderRadius: 2 }}
            />
          )}
        </Box>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {cargando ? (
        <Loader />
      ) : eventos.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No hay eventos disponibles por ahora.
        </Typography>
      ) : (
        <Grid container spacing={2.5}>
          {eventos.map((evento) => (
            <Grid item xs={12} sm={6} md={4} key={evento.id}>
              <EventCard evento={evento} />
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}
