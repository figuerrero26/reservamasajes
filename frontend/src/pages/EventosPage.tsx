import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Alert, Box, Button, Chip, Grid, Stack, Typography, useTheme } from "@mui/material";
import { alpha } from "@mui/material/styles";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import EventOutlinedIcon from "@mui/icons-material/EventOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import SpaOutlinedIcon from "@mui/icons-material/SpaOutlined";
import EventCard, { type DatoTarjeta } from "../components/EventCard";
import EstadoChip from "../components/EstadoChip";
import EmptyState from "../components/EmptyState";
import Loader from "../components/Loader";
import MutedVideo from "../components/MutedVideo";
import type { ActividadPublica, EventoPublico } from "../types";
import { listarEventos } from "../services/eventos";
import { listarActividadesPublicas } from "../services/actividades";
import { mensajeError } from "../utils/errors";
import { formatearFecha, formatearHora, nombreDia } from "../utils/fechas";
import { esVideo } from "../utils/media";
import { useConfig } from "../hooks/useConfig";
import { useUsuarioAuth } from "../hooks/useUsuarioAuth";

type Filtro = "todo" | "turnos" | "actividades";

interface TarjetaCatalogo {
  key: string;
  clase: Exclude<Filtro, "todo">;
  props: Parameters<typeof EventCard>[0];
}

function tarjetaDeEvento(e: EventoPublico): TarjetaCatalogo {
  const datos: DatoTarjeta[] = [{ icono: <ScheduleOutlinedIcon />, texto: `Sesiones de ${e.duracion_minutos} min` }];
  if (e.areas.length > 0) datos.push({ icono: <PlaceOutlinedIcon />, texto: e.areas.join(" · ") });
  return {
    key: `evento-${e.id}`,
    clase: "turnos",
    props: {
      tipo: "Reserva de turno", titulo: e.nombre, descripcionCorta: e.descripcion_corta, imagenUrl: e.imagen_url,
      datos, ruta: `/eventos/${e.id}`, textoAccion: "Ver horarios",
    },
  };
}

function tarjetaDeActividad(a: ActividadPublica): TarjetaCatalogo {
  const r = a.resumen;
  const datos: DatoTarjeta[] = [];
  if (r.proxima_fecha) {
    datos.push({
      icono: <EventOutlinedIcon />,
      texto: `${nombreDia(r.proxima_fecha)} ${formatearFecha(r.proxima_fecha)}${r.proxima_hora_inicio ? ` · ${formatearHora(r.proxima_hora_inicio)}` : ""}`
        + (r.sesiones_futuras > 1 ? ` (+${r.sesiones_futuras - 1} fechas)` : ""),
    });
  }
  datos.push({
    icono: <GroupsOutlinedIcon />,
    texto: r.cupos_disponibles == null ? "Cupos sin límite" : `${r.cupos_disponibles} cupo(s) disponible(s)`,
  });
  return {
    key: `actividad-${a.id}`,
    clase: "actividades",
    props: {
      tipo: "Actividad con inscripción", titulo: a.nombre, descripcionCorta: a.descripcion_corta, imagenUrl: a.imagen_url,
      datos, ruta: `/actividades/${a.id}`, textoAccion: a.inscripcion_disponible ? "Inscribirme" : "Ver detalle",
      estado: <EstadoChip tipo="actividad" estado={a.estado_inscripcion} sx={{ bgcolor: "background.paper" }} />,
    },
  };
}

export default function EventosPage() {
  const config = useConfig();
  const { token } = useUsuarioAuth();
  const theme = useTheme();
  const [tarjetas, setTarjetas] = useState<TarjetaCatalogo[]>([]);
  const [filtro, setFiltro] = useState<Filtro>("todo");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listarEventos(), listarActividadesPublicas()])
      .then(([eventos, actividades]) => {
        setTarjetas([...eventos.map(tarjetaDeEvento), ...actividades.map(tarjetaDeActividad)]);
      })
      .catch((e) => setError(mensajeError(e, "No se pudo cargar el catálogo.")))
      .finally(() => setCargando(false));
  }, []);

  const hayAmbos = tarjetas.some((t) => t.clase === "turnos") && tarjetas.some((t) => t.clase === "actividades");
  const visibles = useMemo(
    () => (filtro === "todo" ? tarjetas : tarjetas.filter((t) => t.clase === filtro)),
    [tarjetas, filtro],
  );

  const fondoMedia = config.color_fondo_bienvenida || theme.palette.primary.main;
  const media = config.imagen_bienvenida_url;

  return (
    <Box>
      {/* Portada */}
      <Grid container spacing={{ xs: 4, md: 6 }} alignItems="center" sx={{ mb: { xs: 6, md: 10 } }}>
        <Grid item xs={12} md={media ? 6 : 12}>
          {config.empresa_nombre && (
            <Typography variant="overline" color="text.secondary" component="p" sx={{ mb: 1 }}>
              {config.empresa_nombre}
            </Typography>
          )}
          <Typography
            variant="h2"
            component="h1"
            sx={{ fontSize: { xs: "2.3rem", sm: "3rem", md: media ? "3.4rem" : "3.9rem" }, maxWidth: 760 }}
          >
            Relájate y disfruta la semana.
          </Typography>
          <Typography
            variant="h6"
            component="p"
            color="text.secondary"
            sx={{ fontWeight: 400, mt: 2.5, maxWidth: 560, lineHeight: 1.55, whiteSpace: "pre-line" }}
          >
            {config.mensaje_bienvenida || "Reserva tu espacio de bienestar o inscríbete en las actividades del equipo, en pocos pasos."}
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 4 }}>
            <Button variant="contained" size="large" href="#catalogo">
              Explorar disponibilidad
            </Button>
            {!token && (
              <Button variant="outlined" color="inherit" size="large" component={RouterLink} to="/registro">
                Crear mi cuenta
              </Button>
            )}
          </Stack>
        </Grid>
        {media && (
          <Grid item xs={12} md={6}>
            <Box
              sx={{
                borderRadius: 4, overflow: "hidden", aspectRatio: { xs: "16 / 10", md: "4 / 3" },
                bgcolor: alpha(fondoMedia, 0.12),
              }}
            >
              {esVideo(media) ? (
                <MutedVideo src={media} sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              ) : (
                <Box component="img" src={media} alt="" sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              )}
            </Box>
          </Grid>
        )}
      </Grid>

      {/* Catálogo */}
      <Box id="catalogo" sx={{ scrollMarginTop: 96 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", sm: "flex-end" }}
          spacing={2}
          sx={{ mb: 3 }}
        >
          <Box>
            <Typography variant="overline" color="text.secondary" component="p">Disponible ahora</Typography>
            <Typography variant="h4" component="h2">Elige tu próximo momento</Typography>
          </Box>
          {hayAmbos && (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {([
                ["todo", "Todo"], ["turnos", "Reservas de turno"], ["actividades", "Actividades"],
              ] as [Filtro, string][]).map(([valor, texto]) => (
                <Chip
                  key={valor}
                  label={texto}
                  onClick={() => setFiltro(valor)}
                  color={filtro === valor ? "primary" : "default"}
                  variant={filtro === valor ? "filled" : "outlined"}
                />
              ))}
            </Stack>
          )}
        </Stack>

        {!token && !cargando && tarjetas.length > 0 && (
          <Alert
            severity="info"
            sx={{ mb: 3 }}
            action={<Button color="inherit" size="small" component={RouterLink} to="/registro">Registrarme</Button>}
          >
            Puedes ver la disponibilidad sin cuenta; para reservar o inscribirte necesitas iniciar sesión.
          </Alert>
        )}

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {cargando ? (
          <Loader texto="Cargando disponibilidad…" />
        ) : visibles.length === 0 && !error ? (
          <EmptyState
            icono={<SpaOutlinedIcon />}
            titulo="Por ahora no hay espacios publicados"
            descripcion="Vuelve pronto: aquí aparecerán los eventos y actividades disponibles."
          />
        ) : (
          <Grid container spacing={3}>
            {visibles.map((t) => (
              <Grid item xs={12} sm={6} md={4} key={t.key}>
                <EventCard {...t.props} />
              </Grid>
            ))}
          </Grid>
        )}
      </Box>
    </Box>
  );
}
