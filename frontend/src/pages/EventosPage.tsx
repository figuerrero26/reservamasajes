import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Alert, Box, Button, Chip, Grid, Stack, Typography, useTheme } from "@mui/material";
import { alpha } from "@mui/material/styles";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import EventOutlinedIcon from "@mui/icons-material/EventOutlined";
import SpaOutlinedIcon from "@mui/icons-material/SpaOutlined";
import EventCard, { type DatoTarjeta } from "../components/EventCard";
import EmptyState from "../components/EmptyState";
import Loader from "../components/Loader";
import MutedVideo from "../components/MutedVideo";
import type { ActividadPublica, EventoPublico } from "../types";
import { listarEventos } from "../services/eventos";
import { listarActividadesPublicas } from "../services/actividades";
import { mensajeError } from "../utils/errors";
import { formatearFecha, nombreDia, textoVigencia } from "../utils/fechas";
import { esVideo } from "../utils/media";
import { useConfig } from "../hooks/useConfig";
import { useUsuarioAuth } from "../hooks/useUsuarioAuth";

type Filtro = "todo" | "turnos" | "actividades";

interface TarjetaCatalogo {
  key: string;
  clase: Exclude<Filtro, "todo">;
  props: Parameters<typeof EventCard>[0];
}

// Las tarjetas solo muestran información general e identificativa, propia de cada tipo:
// reserva (lugar, fechas y duración de las sesiones) o inscripción (área y fecha de
// realización). La disponibilidad —turnos o cupos— se consulta en el detalle.

function datoVigencia(inicio?: string | null, fin?: string | null): DatoTarjeta[] {
  const texto = textoVigencia(inicio, fin);
  return texto ? [{ icono: <EventOutlinedIcon />, texto }] : [];
}

/** Evento de reserva: lugar, fechas y duración de cada sesión (cada persona elige su turno). */
function tarjetaDeEvento(e: EventoPublico): TarjetaCatalogo {
  const duracion = e.duracion_minutos === e.duracion_maxima
    ? `Sesiones de ${e.duracion_minutos} min`
    : `Sesiones de ${e.duracion_minutos}–${e.duracion_maxima} min`;
  const datos: DatoTarjeta[] = [];
  if (e.areas.length > 0) datos.push({ icono: <PlaceOutlinedIcon />, texto: e.areas.join(" · ") });
  datos.push(...datoVigencia(e.vigencia_inicio, e.vigencia_fin));
  datos.push({ icono: <ScheduleOutlinedIcon />, texto: duracion });
  return {
    key: `evento-${e.id}`,
    clase: "turnos",
    props: {
      tipo: "Evento de reserva", titulo: e.nombre, descripcionCorta: e.descripcion_corta, imagenUrl: e.imagen_url,
      datos, ruta: `/eventos/${e.id}`, textoAccion: "Ver horarios",
    },
  };
}

/** Evento de inscripción: área y fecha de realización (nada de turnos ni duraciones). */
function tarjetaDeActividad(a: ActividadPublica): TarjetaCatalogo {
  const datos: DatoTarjeta[] = [];
  if (a.area_nombre) datos.push({ icono: <CategoryOutlinedIcon />, texto: a.area_nombre });
  const { sesiones_futuras: cuantas, proxima_fecha: proxima } = a.resumen;
  if (proxima) {
    datos.push({
      icono: <EventOutlinedIcon />,
      texto: cuantas > 1 ? `${cuantas} fechas · desde el ${formatearFecha(proxima)}` : `${nombreDia(proxima)} ${formatearFecha(proxima)}`,
    });
  } else {
    datos.push(...datoVigencia(a.vigencia_inicio, a.vigencia_fin));
  }
  return {
    key: `actividad-${a.id}`,
    clase: "actividades",
    props: {
      tipo: "Evento de inscripción", titulo: a.nombre, descripcionCorta: a.descripcion_corta, imagenUrl: a.imagen_url,
      datos, ruta: `/actividades/${a.id}`, textoAccion: "Ver e inscribirme",
    },
  };
}

export default function EventosPage() {
  const config = useConfig();
  const { token } = useUsuarioAuth();
  const theme = useTheme();
  const [eventos, setEventos] = useState<EventoPublico[]>([]);
  const [actividades, setActividades] = useState<ActividadPublica[]>([]);
  const [filtro, setFiltro] = useState<Filtro>("todo");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listarEventos(), listarActividadesPublicas()])
      .then(([ev, ac]) => {
        setEventos(ev);
        setActividades(ac);
      })
      .catch((e) => setError(mensajeError(e, "No se pudo cargar el catálogo.")))
      .finally(() => setCargando(false));
  }, []);

  const tarjetas = useMemo(
    () => [...eventos.map(tarjetaDeEvento), ...actividades.map(tarjetaDeActividad)],
    [eventos, actividades],
  );

  const hayAmbos = tarjetas.some((t) => t.clase === "turnos") && tarjetas.some((t) => t.clase === "actividades");
  const visibles = tarjetas.filter((t) => filtro === "todo" || t.clase === filtro);

  const fondoMedia = config.color_fondo_bienvenida || theme.palette.primary.main;
  const media = config.imagen_bienvenida_url;

  return (
    <Box>
      {/* Portada */}
      <Grid container spacing={{ xs: 4, md: 6 }} alignItems="center" sx={{ mb: { xs: 6, md: 10 } }}>
        <Grid item xs={12} md={media ? 6 : 12}>
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
              Ver eventos
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
            <Box sx={{ borderRadius: 4, overflow: "hidden", aspectRatio: { xs: "16 / 10", md: "4 / 3" }, bgcolor: alpha(fondoMedia, 0.25) }}>
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
          direction={{ xs: "column", md: "row" }}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", md: "flex-end" }}
          spacing={2}
          sx={{ mb: 3 }}
        >
          <Box>
            <Typography variant="overline" color="text.secondary" component="p">Disponible ahora</Typography>
            <Typography variant="h4" component="h2">Elige tu próximo momento</Typography>
          </Box>
          {hayAmbos && (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {([["todo", "Todo"], ["turnos", "Reservas"], ["actividades", "Inscripciones"]] as [Filtro, string][]).map(
                ([valor, texto]) => (
                  <Chip
                    key={valor}
                    label={texto}
                    onClick={() => setFiltro(valor)}
                    color={filtro === valor ? "primary" : "default"}
                    variant={filtro === valor ? "filled" : "outlined"}
                  />
                ),
              )}
            </Stack>
          )}
        </Stack>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {cargando ? (
          <Loader texto="Cargando eventos…" />
        ) : visibles.length === 0 && !error ? (
          <EmptyState
            icono={<SpaOutlinedIcon />}
            titulo={tarjetas.length ? "No hay espacios con ese filtro" : "Por ahora no hay espacios publicados"}
            descripcion={tarjetas.length ? "Prueba con otro tipo." : "Vuelve pronto: aquí aparecerán los eventos y actividades disponibles."}
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
