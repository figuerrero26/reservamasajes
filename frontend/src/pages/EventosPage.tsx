import { useEffect, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Alert, Box, Button, Grid, Paper, Typography, useTheme } from "@mui/material";
import PlaceIcon from "@mui/icons-material/Place";
import ScheduleIcon from "@mui/icons-material/Schedule";
import EventCard, { type ChipTarjeta } from "../components/EventCard";
import Loader from "../components/Loader";
import MutedVideo from "../components/MutedVideo";
import type { ActividadPublica, EventoPublico } from "../types";
import { listarEventos } from "../services/eventos";
import { listarActividadesPublicas } from "../services/actividades";
import { mensajeError } from "../utils/errors";
import { esVideo } from "../utils/media";
import { useConfig } from "../hooks/useConfig";
import { useUsuarioAuth } from "../hooks/useUsuarioAuth";

interface TarjetaCatalogo {
  key: string;
  titulo: string;
  descripcionCorta?: string | null;
  imagenUrl?: string | null;
  chips: ChipTarjeta[];
  ruta: string;
  textoBoton: string;
}

function tarjetaDeEvento(e: EventoPublico): TarjetaCatalogo {
  return {
    key: `evento-${e.id}`,
    titulo: e.nombre,
    descripcionCorta: e.descripcion_corta,
    imagenUrl: e.imagen_url,
    chips: [
      { icon: <ScheduleIcon />, label: `${e.duracion_minutos} min` },
      ...(e.areas.length > 0 ? [{ icon: <PlaceIcon />, label: e.areas.join(", ") }] : []),
    ],
    ruta: `/eventos/${e.id}`,
    textoBoton: "Ver disponibilidad",
  };
}

function tarjetaDeActividad(a: ActividadPublica): TarjetaCatalogo {
  return {
    key: `actividad-${a.id}`,
    titulo: a.nombre,
    descripcionCorta: a.descripcion_corta,
    imagenUrl: a.imagen_url,
    chips: [
      {
        label: a.inscripcion_disponible ? "Inscripciones abiertas" : "Inscripciones cerradas",
        color: a.inscripcion_disponible ? "success" : "default",
      },
    ],
    ruta: `/actividades/${a.id}`,
    textoBoton: "Ver detalle",
  };
}

export default function EventosPage() {
  const config = useConfig();
  const { token } = useUsuarioAuth();
  const theme = useTheme();
  const colorFondoBienvenida = config.color_fondo_bienvenida || theme.palette.primary.main;
  const [tarjetas, setTarjetas] = useState<TarjetaCatalogo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listarEventos(), listarActividadesPublicas()])
      .then(([eventos, actividades]) => {
        setTarjetas([...eventos.map(tarjetaDeEvento), ...actividades.map(tarjetaDeActividad)]);
      })
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
      ) : tarjetas.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No hay eventos disponibles por ahora.
        </Typography>
      ) : (
        <Grid container spacing={2.5}>
          {tarjetas.map((t) => (
            <Grid item xs={12} sm={6} md={4} key={t.key}>
              <EventCard
                titulo={t.titulo}
                descripcionCorta={t.descripcionCorta}
                imagenUrl={t.imagenUrl}
                chips={t.chips}
                ruta={t.ruta}
                textoBoton={t.textoBoton}
              />
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}
