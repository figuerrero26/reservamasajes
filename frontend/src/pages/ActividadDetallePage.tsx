import { useCallback, useEffect, useState } from "react";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Grid,
  LinearProgress, Paper, Stack, Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import EventOutlinedIcon from "@mui/icons-material/EventOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import EstadoChip from "../components/EstadoChip";
import FormularioDinamico, { camposFaltantes } from "../components/FormularioDinamico";
import type { ActividadPublica, Sesion } from "../types";
import { listarSesionesPublicas, obtenerActividadPublica } from "../services/actividades";
import { crearInscripcion, type Respuestas } from "../services/inscripciones";
import { mensajeError } from "../utils/errors";
import { formatearFechaHora, formatearFechaLarga, formatearHora } from "../utils/fechas";
import { useUsuarioAuth } from "../hooks/useUsuarioAuth";

const MENSAJE_ESTADO: Record<string, string> = {
  agotada: "Todos los cupos están ocupados. Si alguien cancela, el cupo vuelve a quedar disponible.",
  proximamente: "Las inscripciones todavía no están abiertas.",
  cerrada: "Las inscripciones para esta actividad están cerradas.",
  finalizada: "Esta actividad no tiene fechas próximas.",
};

function Ocupacion({ sesion }: { sesion: Sesion }) {
  if (sesion.cupo_maximo == null) {
    return <Typography variant="caption" color="text.secondary">{sesion.inscritos} inscrito(s) · sin límite de cupo</Typography>;
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
    setError(null);
    try {
      const [a, s] = await Promise.all([obtenerActividadPublica(actividadId), listarSesionesPublicas(actividadId)]);
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
  }, [cargar, token]);

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

  const mensajeEstado = MENSAJE_ESTADO[actividad.estado_inscripcion];

  return (
    <Box>
      <Button component={RouterLink} to="/" startIcon={<ArrowBackIcon />} color="inherit" sx={{ mb: 2, ml: -1 }}>
        Volver
      </Button>

      <Grid container spacing={{ xs: 4, md: 6 }}>
        <Grid item xs={12} md={7}>
          <Stack spacing={2.5}>
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                <Typography variant="overline" color="text.secondary">Actividad</Typography>
                <EstadoChip tipo="actividad" estado={actividad.estado_inscripcion} />
              </Stack>
              <Typography variant="h3" component="h1" sx={{ fontSize: { xs: "2rem", sm: "2.6rem" } }}>
                {actividad.nombre}
              </Typography>
              {actividad.descripcion_corta && (
                <Typography variant="h6" component="p" color="text.secondary" sx={{ fontWeight: 400, mt: 1.5 }}>
                  {actividad.descripcion_corta}
                </Typography>
              )}
            </Box>
            {actividad.imagen_url && (
              <Box
                component="img"
                src={actividad.imagen_url}
                alt=""
                sx={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", borderRadius: 4 }}
              />
            )}
            {actividad.descripcion_larga && (
              <Typography variant="body1" sx={{ whiteSpace: "pre-line" }}>{actividad.descripcion_larga}</Typography>
            )}
            {actividad.informacion_adicional && (
              <Paper variant="outlined" sx={{ p: 2.5, bgcolor: "background.default" }}>
                <Typography variant="subtitle2" gutterBottom>Información importante</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-line" }}>
                  {actividad.informacion_adicional}
                </Typography>
              </Paper>
            )}
            {actividad.fecha_cierre_inscripciones && actividad.estado_inscripcion === "abierta" && (
              <Typography variant="body2" color="text.secondary">
                Inscripciones abiertas hasta el {formatearFechaHora(actividad.fecha_cierre_inscripciones)}.
              </Typography>
            )}
            {actividad.fecha_apertura_inscripciones && actividad.estado_inscripcion === "proximamente" && (
              <Typography variant="body2" color="text.secondary">
                Las inscripciones abren el {formatearFechaHora(actividad.fecha_apertura_inscripciones)}.
              </Typography>
            )}
          </Stack>
        </Grid>

        <Grid item xs={12} md={5}>
          <Box sx={{ position: { md: "sticky" }, top: { md: 96 } }}>
            <Typography variant="h6" sx={{ mb: 1.5 }}>
              {sesiones.length === 1 ? "Fecha" : "Elige una fecha"}
            </Typography>
            {mensajeEstado && <Alert severity="info" sx={{ mb: 2 }}>{mensajeEstado}</Alert>}
            {sesiones.length === 0 ? (
              <EmptyState titulo="Sin fechas programadas" descripcion="Cuando haya nuevas fechas aparecerán aquí." />
            ) : (
              <Stack spacing={1.5}>
                {sesiones.map((s) => {
                  const disponible = s.estado === "disponible" && !s.inscrito;
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
                          <Button variant="contained" fullWidth disabled={!disponible} onClick={() => abrirInscripcion(s)}>
                            {s.estado === "cupo_lleno" ? "Sin cupos" : "Inscribirme"}
                          </Button>
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
              <Button variant="contained" onClick={confirmarInscripcion} disabled={inscribiendo}>
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
