import { useCallback, useEffect, useState } from "react";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Grid,
  LinearProgress, Paper, Stack, Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import EventOutlinedIcon from "@mui/icons-material/EventOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import Loader from "../components/Loader";
import { PortadaEvento } from "../components/EventCard";
import DetalleEvento from "../components/DetalleEvento";
import EmptyState from "../components/EmptyState";
import EstadoChip from "../components/EstadoChip";
import FormularioDinamico, { camposFaltantes } from "../components/FormularioDinamico";
import type { ActividadPublica, Sesion } from "../types";
import { listarSesionesPublicas, obtenerActividadPublica } from "../services/actividades";
import { crearInscripcion, type Respuestas } from "../services/inscripciones";
import { mensajeError } from "../utils/errors";
import { formatearFechaLarga, formatearHora, programarActualizacion, textoFechasLargas } from "../utils/fechas";
import { useUsuarioAuth } from "../hooks/useUsuarioAuth";

const MENSAJE_ESTADO: Record<string, string> = {
  agotada: "Todos los cupos están ocupados. Si alguien cancela, el cupo vuelve a quedar disponible.",
  proximamente: "Este evento todavía no abre sus inscripciones.",
  cerrada: "Las inscripciones están pausadas por el momento.",
  finalizada: "Esta actividad no tiene fechas próximas.",
};

/** Disponibilidad de cupos de una fecha (solo cuando la sesión tiene cupo definido). */
function Ocupacion({ sesion }: { sesion: Sesion }) {
  if (sesion.cupo_maximo == null) {
    return <Typography variant="caption" color="text.secondary">Cupos sin límite</Typography>;
  }
  const porcentaje = Math.min(100, (sesion.inscritos / sesion.cupo_maximo) * 100);
  return (
    <Box>
      <LinearProgress
        variant="determinate"
        value={porcentaje}
        color={porcentaje >= 100 ? "warning" : "primary"}
        sx={{ height: 6, borderRadius: 3, mb: 0.75 }}
      />
      <Typography variant="caption" color="text.secondary">
        {sesion.cupos_disponibles} de {sesion.cupo_maximo} cupos disponibles
      </Typography>
    </Box>
  );
}

export default function ActividadDetallePage() {
  const { id } = useParams<{ id: string }>();
  const actividadId = Number(id);
  const navigate = useNavigate();
  const { token } = useUsuarioAuth();

  const [actividad, setActividad] = useState<ActividadPublica | null>(null);
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sesionSeleccionada, setSesionSeleccionada] = useState<Sesion | null>(null);
  const [respuestas, setRespuestas] = useState<Respuestas>({});
  const [inscribiendo, setInscribiendo] = useState(false);
  const [errorInscripcion, setErrorInscripcion] = useState<string | null>(null);
  const [exito, setExito] = useState(false);
  const [loginRequerido, setLoginRequerido] = useState(false);

  const cargar = useCallback(async (mostrarCarga = true) => {
    if (mostrarCarga) setCargando(true);
    try {
      const [a, s] = await Promise.all([obtenerActividadPublica(actividadId), listarSesionesPublicas(actividadId)]);
      setError(null);
      setActividad(a);
      setSesiones(s);
    } catch (e) {
      setError(mensajeError(e, "No se pudo cargar la actividad."));
    } finally {
      setCargando(false);
    }
  }, [actividadId]);

  useEffect(() => {
    cargar();
    const intervalo = window.setInterval(() => {
      if (!document.hidden) void cargar(false);
    }, 10000);
    return () => window.clearInterval(intervalo);
  }, [cargar, token]);

  const proximoCambio = actividad?.proximo_cambio_en;
  useEffect(() => {
    const temporizador = programarActualizacion(proximoCambio, () => { void cargar(false); });
    return () => window.clearTimeout(temporizador);
  }, [cargar, proximoCambio, token]);

  function abrirInscripcion(sesion: Sesion) {
    if (!token) {
      setLoginRequerido(true);
      return;
    }
    setSesionSeleccionada(sesion);
    setRespuestas({});
    setErrorInscripcion(null);
    setExito(false);
  }

  async function confirmarInscripcion() {
    if (!sesionSeleccionada || !actividad) return;
    const faltantes = camposFaltantes(actividad.campos_formulario, respuestas);
    if (faltantes.length) {
      setErrorInscripcion(`Completa: ${faltantes.join(", ")}.`);
      return;
    }
    setInscribiendo(true);
    setErrorInscripcion(null);
    try {
      await crearInscripcion(sesionSeleccionada.id, respuestas);
      setExito(true);
      await cargar(false);
    } catch (e) {
      setErrorInscripcion(mensajeError(e, "No se pudo completar la inscripción."));
      await cargar(false); // el cupo pudo haberse llenado mientras tanto
    } finally {
      setInscribiendo(false);
    }
  }

  if (cargando) return <Loader texto="Cargando actividad…" />;
  if (error || !actividad) {
    return (
      <EmptyState
        titulo="No encontramos esta actividad"
        descripcion={error ?? "Es posible que ya no esté disponible."}
        accion={<Button component={RouterLink} to="/" variant="contained">Volver al inicio</Button>}
      />
    );
  }

  const mensajeEstado = actividad.motivo_no_disponible ?? MENSAJE_ESTADO[actividad.estado_inscripcion];
  const sesionUnica = sesiones.length === 1 ? sesiones[0] : null;
  const realizacion = sesionUnica
    ? `${formatearFechaLarga(sesionUnica.fecha)} · ${formatearHora(sesionUnica.hora_inicio)} a ${formatearHora(sesionUnica.hora_fin)}`
      + (sesionUnica.lugar ? ` · ${sesionUnica.lugar}` : "")
    : sesiones.length > 1
      ? `${sesiones.length} fechas programadas, ${textoFechasLargas(sesiones[0].fecha, sesiones[sesiones.length - 1].fecha)?.toLowerCase()}. Elige la tuya en «Elige una fecha».`
      : null;
  return (
    <Box>
      <Button component={RouterLink} to="/" startIcon={<ArrowBackIcon />} color="inherit" sx={{ mb: 2, ml: -1 }}>
        Volver
      </Button>

      <Grid container spacing={{ xs: 4, md: 6 }}>
        <Grid item xs={12} md={7}>
          <Stack spacing={2.5}>
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
                <Typography variant="overline" color="text.secondary">Evento de inscripción</Typography>
                <EstadoChip tipo="actividad" estado={actividad.estado_inscripcion} />
              </Stack>
              <Typography variant="h3" component="h1" sx={{ fontSize: { xs: "2rem", sm: "2.6rem" }, wordBreak: "break-word" }}>
                {actividad.nombre}
              </Typography>
              {actividad.descripcion_corta && (
                <Typography variant="h6" component="p" color="text.secondary" sx={{ fontWeight: 400, mt: 1.5 }}>
                  {actividad.descripcion_corta}
                </Typography>
              )}
            </Box>
            {actividad.imagen_url && <PortadaEvento imagenUrl={actividad.imagen_url} radio={4} />}
            {actividad.descripcion_larga && (
              <Typography variant="body1" sx={{ whiteSpace: "pre-line" }}>{actividad.descripcion_larga}</Typography>
            )}
            {/* Solo lo esencial: área, cuándo se realiza e información importante — sin
                detalles del proceso de inscripción (eso ya lo resuelve el panel de la
                derecha). */}
            <DetalleEvento
              filas={[
                { icono: <CategoryOutlinedIcon />, titulo: "Área", contenido: actividad.area_nombre },
                { icono: <EventOutlinedIcon />, titulo: sesiones.length === 1 ? "Fecha y horario" : "Fechas", contenido: realizacion },
                {
                  icono: <InfoOutlinedIcon />,
                  titulo: "Información importante",
                  contenido: actividad.informacion_adicional
                    ? <Box component="span" sx={{ whiteSpace: "pre-line" }}>{actividad.informacion_adicional}</Box>
                    : null,
                },
              ]}
            />
          </Stack>
        </Grid>

        <Grid item xs={12} md={5}>
          <Box sx={{ position: { md: "sticky" }, top: { md: 96 } }}>
            <Typography variant="h6" sx={{ mb: 1.5 }}>
              {sesiones.length === 1 ? "Fecha y horario" : "Elige una fecha"}
            </Typography>
            {mensajeEstado && <Alert severity="info" sx={{ mb: 2 }}>{mensajeEstado}</Alert>}
            {sesiones.length === 0 ? (
              <EmptyState titulo="Sin fechas programadas" descripcion="Cuando haya nuevas fechas aparecerán aquí." />
            ) : (
              <Stack spacing={1.5}>
                {sesiones.map((s) => {
                  // `puede_inscribirse` (con sesión iniciada) suma el límite de participación del
                  // evento; sin sesión solo se conoce el estado de la sesión.
                  const disponible = s.estado === "disponible" && !s.inscrito && s.puede_inscribirse !== false;
                  const motivoLimite = s.estado === "disponible" && !s.inscrito && s.puede_inscribirse === false
                    ? s.motivo_no_disponible : null;
                  return (
                    <Paper key={s.id} variant="outlined" sx={{ p: 2.5, borderColor: s.inscrito ? "primary.main" : undefined }}>
                      <Stack spacing={1.5}>
                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                          <Box>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <EventOutlinedIcon fontSize="small" color="action" />
                              <Typography variant="subtitle1">{formatearFechaLarga(s.fecha)}</Typography>
                            </Stack>
                            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5, color: "text.secondary" }}>
                              <ScheduleOutlinedIcon sx={{ fontSize: 18 }} />
                              <Typography variant="body2">{formatearHora(s.hora_inicio)} – {formatearHora(s.hora_fin)}</Typography>
                            </Stack>
                            {s.lugar && (
                              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5, color: "text.secondary" }}>
                                <PlaceOutlinedIcon sx={{ fontSize: 18 }} />
                                <Typography variant="body2">{s.lugar}</Typography>
                              </Stack>
                            )}
                          </Box>
                          {!s.inscrito && s.estado !== "disponible" && <EstadoChip tipo="sesion" estado={s.estado} />}
                        </Stack>
                        <Ocupacion sesion={s} />
                        {s.inscrito ? (
                          <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap>
                            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ color: "primary.main" }}>
                              <CheckCircleIcon fontSize="small" />
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>Ya estás inscrito</Typography>
                            </Stack>
                            <Button size="small" component={RouterLink} to="/mis-inscripciones">Gestionar</Button>
                          </Stack>
                        ) : (
                          <Stack spacing={0.75}>
                            {motivoLimite && <Typography variant="caption" color="text.secondary">{motivoLimite}</Typography>}
                            <Button variant="contained" fullWidth disabled={!disponible} onClick={() => abrirInscripcion(s)}>
                              {s.estado === "cupo_lleno" ? "Sin cupos" : motivoLimite ? "No disponible para ti" : "Inscribirme"}
                            </Button>
                          </Stack>
                        )}
                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>
            )}
          </Box>
        </Grid>
      </Grid>

      <Dialog
        open={!!sesionSeleccionada}
        onClose={() => !inscribiendo && setSesionSeleccionada(null)}
        maxWidth="xs"
        fullWidth
      >
        {exito ? (
          <>
            <DialogContent sx={{ textAlign: "center", pt: 4 }}>
              <CheckCircleIcon color="success" sx={{ fontSize: 56, mb: 1 }} />
              <Typography variant="h6" gutterBottom>¡Inscripción confirmada!</Typography>
              <Typography variant="body2" color="text.secondary">
                Te enviaremos un correo con los detalles. Puedes consultar o cancelar tu inscripción en «Mis inscripciones».
              </Typography>
            </DialogContent>
            <DialogActions sx={{ justifyContent: "center" }}>
              <Button onClick={() => setSesionSeleccionada(null)}>Cerrar</Button>
              <Button variant="contained" component={RouterLink} to="/mis-inscripciones">Ver mis inscripciones</Button>
            </DialogActions>
          </>
        ) : (
          <>
            <DialogTitle>Confirmar inscripción</DialogTitle>
            <DialogContent>
              <Stack spacing={2}>
                {errorInscripcion && <Alert severity="error">{errorInscripcion}</Alert>}
                {sesionSeleccionada && (
                  <Paper variant="outlined" sx={{ p: 2, bgcolor: "background.default" }}>
                    <Typography variant="subtitle2">{actividad.nombre}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {formatearFechaLarga(sesionSeleccionada.fecha)} · {formatearHora(sesionSeleccionada.hora_inicio)} –{" "}
                      {formatearHora(sesionSeleccionada.hora_fin)}
                      {sesionSeleccionada.lugar ? ` · ${sesionSeleccionada.lugar}` : ""}
                    </Typography>
                  </Paper>
                )}
                <FormularioDinamico campos={actividad.campos_formulario} valores={respuestas} onChange={setRespuestas} />
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setSesionSeleccionada(null)} disabled={inscribiendo}>Cancelar</Button>
              <Button variant="contained" onClick={confirmarInscripcion} disabled={inscribiendo || !actividad.inscripcion_disponible}>
                {inscribiendo ? "Inscribiendo…" : "Confirmar inscripción"}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      <Dialog open={loginRequerido} onClose={() => setLoginRequerido(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Inicia sesión para inscribirte</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Necesitas una cuenta para reservar tu cupo. Al ingresar volverás a esta actividad.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLoginRequerido(false)}>Cancelar</Button>
          <Button variant="outlined" onClick={() => navigate(`/registro?next=/actividades/${actividadId}`)}>Crear cuenta</Button>
          <Button variant="contained" onClick={() => navigate(`/login?next=/actividades/${actividadId}`)}>Iniciar sesión</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
