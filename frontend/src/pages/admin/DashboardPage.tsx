import { useEffect, useState } from "react";
import { Box, Card, CardActionArea, CardContent, Grid, Paper, Skeleton, Stack, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import PageHeader from "../../components/PageHeader";
import { ETIQUETA_GRUPO, SECCIONES_ADMIN } from "../../constants/secciones";
import { obtenerDia } from "../../services/reservas";
import { listarActividades } from "../../services/actividades";
import { formatearFechaLarga, hoyBogota } from "../../utils/fechas";

interface Resumen {
  reservasHoy: number;
  disponiblesHoy: number;
  actividadesAbiertas: number;
  inscritosProximos: number;
}

function Indicador({ etiqueta, valor }: { etiqueta: string; valor: number | null }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, height: "100%" }}>
      <Typography variant="body2" color="text.secondary">{etiqueta}</Typography>
      {valor === null ? (
        <Skeleton width={60} height={44} />
      ) : (
        <Typography variant="h4" component="p" sx={{ mt: 0.5 }}>{valor}</Typography>
      )}
    </Paper>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const hoy = hoyBogota();
  const [resumen, setResumen] = useState<Resumen | null>(null);

  useEffect(() => {
    Promise.all([obtenerDia(hoy), listarActividades()])
      .then(([agendas, actividades]) => {
        const slots = agendas.flatMap((a) => a.slots);
        setResumen({
          reservasHoy: slots.filter((s) => s.reserva_id).length,
          disponiblesHoy: slots.filter((s) => s.estado === "disponible").length,
          actividadesAbiertas: actividades.filter((a) => a.estado_inscripcion === "abierta").length,
          inscritosProximos: actividades.reduce((t, a) => t + a.resumen.inscritos_futuros, 0),
        });
      })
      .catch(() => setResumen({ reservasHoy: 0, disponiblesHoy: 0, actividadesAbiertas: 0, inscritosProximos: 0 }));
  }, [hoy]);

  const grupos = (["operacion", "catalogo", "sistema"] as const).map((g) => ({
    grupo: g,
    secciones: SECCIONES_ADMIN.filter((s) => s.grupo === g && s.ruta !== "/admin"),
  }));

  return (
    <Box>
      <PageHeader antetitulo={formatearFechaLarga(hoy)} titulo="Panel de administración" />

      <Grid container spacing={2} sx={{ mb: 5 }}>
        <Grid item xs={6} md={3}><Indicador etiqueta="Reservas de hoy" valor={resumen?.reservasHoy ?? null} /></Grid>
        <Grid item xs={6} md={3}><Indicador etiqueta="Turnos libres hoy" valor={resumen?.disponiblesHoy ?? null} /></Grid>
        <Grid item xs={6} md={3}><Indicador etiqueta="Inscripciones abiertas" valor={resumen?.actividadesAbiertas ?? null} /></Grid>
        <Grid item xs={6} md={3}><Indicador etiqueta="Inscritos próximos" valor={resumen?.inscritosProximos ?? null} /></Grid>
      </Grid>

      <Stack spacing={4}>
        {grupos.map(({ grupo, secciones }) => (
          <Box key={grupo}>
            <Typography variant="overline" color="text.secondary" component="h2" sx={{ mb: 1.5, display: "block" }}>
              {ETIQUETA_GRUPO[grupo]}
            </Typography>
            <Grid container spacing={2}>
              {secciones.map((s) => (
                <Grid item xs={12} sm={6} md={4} key={s.ruta}>
                  <Card sx={{ height: "100%", "&:hover": { borderColor: "text.primary" } }}>
                    <CardActionArea onClick={() => navigate(s.ruta)} sx={{ height: "100%" }}>
                      <CardContent>
                        <Stack direction="row" spacing={2} alignItems="flex-start">
                          <Box sx={{ color: "primary.main", display: "flex" }}>{s.icono}</Box>
                          <Box>
                            <Typography variant="subtitle1">{s.texto}</Typography>
                            <Typography variant="body2" color="text.secondary">{s.descripcion}</Typography>
                          </Box>
                        </Stack>
                      </CardContent>
                    </CardActionArea>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
