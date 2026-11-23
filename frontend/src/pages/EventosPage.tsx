import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Alert, Box, Button, Chip, Grid, MenuItem, Stack, TextField, Typography, useTheme } from "@mui/material";
import { alpha } from "@mui/material/styles";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import EventOutlinedIcon from "@mui/icons-material/EventOutlined";
import SpaOutlinedIcon from "@mui/icons-material/SpaOutlined";
import EventCard, { type DatoTarjeta, type Disponibilidad } from "../components/EventCard";
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
  areaIds: number[];
  props: Parameters<typeof EventCard>[0];
}

const diaCorto = (fecha: string) => `${nombreDia(fecha).slice(0, 3).toLowerCase()} ${formatearFecha(fecha)}`;

function disponibilidadDeEvento(e: EventoPublico): Disponibilidad {
  if (e.turnos_disponibles === 0) {
    return { etiqueta: "Sin turnos disponibles", detalle: "Se liberan cuando alguien cancela.", nivel: "agotada" };
  }
  return {
    numero: e.turnos_disponibles,
    etiqueta: e.turnos_disponibles === 1 ? "turno disponible" : "turnos disponibles",
    detalle: e.proximo_turno_fecha && e.proximo_turno_hora
      ? `Próximo: ${diaCorto(e.proximo_turno_fecha)} · ${formatearHora(e.proximo_turno_hora)}`
      : undefined,
    nivel: e.turnos_disponibles <= 3 ? "baja" : "alta",
  };
}

function disponibilidadDeActividad(a: ActividadPublica): Disponibilidad {
  const r = a.resumen;
  if (a.estado_inscripcion === "agotada") {
    return { etiqueta: "Cupos agotados", detalle: "Si alguien cancela, el cupo se libera.", nivel: "agotada" };
  }
  if (r.cupos_disponibles == null) {
    return {
      etiqueta: "Cupos sin límite",
      detalle: r.inscritos_futuros ? `${r.inscritos_futuros} persona(s) inscrita(s)` : "Sé de los primeros en inscribirte",
      nivel: "alta",
    };
  }
  const total = r.cupos_disponibles + r.inscritos_futuros;
  return {
    numero: r.cupos_disponibles,
    etiqueta: r.cupos_disponibles === 1 ? "cupo disponible" : "cupos disponibles",
    detalle: `de ${total}${r.sesiones_futuras > 1 ? ` en ${r.sesiones_futuras} fechas` : ""}`,
    progreso: total ? (r.inscritos_futuros / total) * 100 : 0,
    nivel: r.cupos_disponibles <= Math.max(3, Math.ceil(total * 0.15)) ? "baja" : "alta",
  };
}

function tarjetaDeEvento(e: EventoPublico): TarjetaCatalogo {
  const duracion = e.duracion_minutos === e.duracion_maxima
    ? `Sesiones de ${e.duracion_minutos} min`
    : `Sesiones de ${e.duracion_minutos}–${e.duracion_maxima} min`;
  const datos: DatoTarjeta[] = [{ icono: <ScheduleOutlinedIcon />, texto: duracion }];
  if (e.areas.length > 0) datos.push({ icono: <PlaceOutlinedIcon />, texto: e.areas.join(" · ") });
  return {
    key: `evento-${e.id}`,
    clase: "turnos",
    areaIds: e.area_ids,
    props: {
      tipo: "Reserva de turno", titulo: e.nombre, descripcionCorta: e.descripcion_corta, imagenUrl: e.imagen_url,
      datos, disponibilidad: disponibilidadDeEvento(e), ruta: `/eventos/${e.id}`,
      textoAccion: e.turnos_disponibles > 0 ? "Ver horarios" : "Ver detalle",
    },
  };
}

function tarjetaDeActividad(a: ActividadPublica): TarjetaCatalogo {
  const r = a.resumen;
  const datos: DatoTarjeta[] = [];
  if (r.proxima_fecha) {
    datos.push({
      icono: <EventOutlinedIcon />,
      texto: `${diaCorto(r.proxima_fecha)}${r.proxima_hora_inicio ? ` · ${formatearHora(r.proxima_hora_inicio)}` : ""}`
        + (r.proxima_hora_fin ? ` – ${formatearHora(r.proxima_hora_fin)}` : ""),
    });
  }
  const lugar = [r.proximo_lugar, a.area_nombre].filter(Boolean).join(" · ");
  if (lugar) datos.push({ icono: <PlaceOutlinedIcon />, texto: lugar });
  return {
    key: `actividad-${a.id}`,
    clase: "actividades",
    areaIds: a.area_id ? [a.area_id] : [],
    props: {
      tipo: "Actividad con inscripción", titulo: a.nombre, descripcionCorta: a.descripcion_corta, imagenUrl: a.imagen_url,
      datos, disponibilidad: disponibilidadDeActividad(a), ruta: `/actividades/${a.id}`,
      textoAccion: a.inscripcion_disponible ? "Inscribirme" : "Ver detalle",
      // El estado solo se destaca cuando NO está abierta (la disponibilidad ya lo dice).
      estado: a.estado_inscripcion !== "abierta" && a.estado_inscripcion !== "agotada"
        ? <EstadoChip tipo="actividad" estado={a.estado_inscripcion} sx={{ bgcolor: "background.paper" }} />
        : undefined,
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
  const [areaId, setAreaId] = useState<number | "todas">("todas");
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

  // Áreas presentes en el catálogo (para el filtro), sin pedir nada extra al backend.
  const areas = useMemo(() => {
    const mapa = new Map<number, string>();
    eventos.forEach((e) => e.area_ids.forEach((id, i) => mapa.set(id, e.areas[i] ?? "")));
    actividades.forEach((a) => a.area_id && mapa.set(a.area_id, a.area_nombre ?? ""));
    return Array.from(mapa, ([id, nombre]) => ({ id, nombre })).sort((x, y) => x.nombre.localeCompare(y.nombre));
  }, [eventos, actividades]);

  const hayAmbos = tarjetas.some((t) => t.clase === "turnos") && tarjetas.some((t) => t.clase === "actividades");
  const visibles = tarjetas.filter(
    (t) => (filtro === "todo" || t.clase === filtro) && (areaId === "todas" || t.areaIds.includes(areaId)),
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
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }} sx={{ width: { xs: "100%", md: "auto" } }}>
            {hayAmbos && (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {([["todo", "Todo"], ["turnos", "Reservas de turno"], ["actividades", "Actividades"]] as [Filtro, string][]).map(
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
            {areas.length > 1 && (
              <TextField
                select
                size="small"
                label="Área"
                value={areaId}
                onChange={(e) => setAreaId(e.target.value === "todas" ? "todas" : Number(e.target.value))}
                sx={{ minWidth: 180 }}
              >
                <MenuItem value="todas">Todas las áreas</MenuItem>
                {areas.map((a) => <MenuItem key={a.id} value={a.id}>{a.nombre}</MenuItem>)}
              </TextField>
            )}
          </Stack>
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
            titulo={tarjetas.length ? "No hay espacios con ese filtro" : "Por ahora no hay espacios publicados"}
            descripcion={tarjetas.length ? "Prueba con otra área o tipo." : "Vuelve pronto: aquí aparecerán los eventos y actividades disponibles."}
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
