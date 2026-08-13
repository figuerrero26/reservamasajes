import { useEffect, useState } from "react";
import { Alert, Box, Grid, Typography } from "@mui/material";
import EventCard from "../components/EventCard";
import Loader from "../components/Loader";
import type { EventoPublico } from "../types";
import { listarEventos } from "../services/eventos";
import { mensajeError } from "../utils/errors";

export default function EventosPage() {
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
        Reserva tu espacio
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Elige una actividad y consulta la disponibilidad de horarios.
      </Typography>

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
