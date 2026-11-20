import { useEffect, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Alert, Box, Card, CardActionArea, CardContent, Chip, Grid, Stack, Typography,
} from "@mui/material";
import Loader from "../components/Loader";
import type { ActividadPublica } from "../types";
import { listarActividadesPublicas } from "../services/actividades";
import { mensajeError } from "../utils/errors";

export default function ActividadesPublicasPage() {
  const [actividades, setActividades] = useState<ActividadPublica[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listarActividadesPublicas()
      .then(setActividades)
      .catch((e) => setError(mensajeError(e, "No se pudieron cargar las actividades.")))
      .finally(() => setCargando(false));
  }, []);

  if (cargando) return <Loader />;

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Actividades</Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Inscríbete a las actividades disponibles — algunas tienen cupo limitado.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {actividades.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No hay actividades disponibles por ahora.
        </Typography>
      ) : (
        <Grid container spacing={2.5}>
          {actividades.map((a) => (
            <Grid item xs={12} sm={6} md={4} key={a.id}>
              <Card variant="outlined" sx={{ height: "100%" }}>
                <CardActionArea component={RouterLink} to={`/actividades/${a.id}`} sx={{ height: "100%", p: 1 }}>
                  <CardContent>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1 }}>
                      <Typography variant="h6">{a.nombre}</Typography>
                      <Chip
                        size="small"
                        label={a.inscripcion_disponible ? "Inscripciones abiertas" : "Inscripciones cerradas"}
                        color={a.inscripcion_disponible ? "success" : "default"}
                      />
                    </Stack>
                    {a.descripcion_corta && (
                      <Typography variant="body2" color="text.secondary">{a.descripcion_corta}</Typography>
                    )}
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}
