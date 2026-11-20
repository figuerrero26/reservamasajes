import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  Stack, Typography,
} from "@mui/material";
import Loader from "../components/Loader";
import FormularioDinamico from "../components/FormularioDinamico";
import type { ActividadPublica, Sesion } from "../types";
import { listarSesionesPublicas, obtenerActividadPublica } from "../services/actividades";
import { crearInscripcion } from "../services/inscripciones";
import { mensajeError } from "../utils/errors";
import { useUsuarioAuth } from "../hooks/useUsuarioAuth";

type Respuestas = Record<string, string | number | boolean | null>;

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

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const [a, s] = await Promise.all([
        obtenerActividadPublica(actividadId),
        listarSesionesPublicas(actividadId),
      ]);
      setActividad(a);
      setSesiones(s);
    } catch (e) {
      setError(mensajeError(e, "No se pudo cargar la actividad."));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actividadId]);

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
    if (!sesionSeleccionada) return;
    setInscribiendo(true);
    setErrorInscripcion(null);
    try {
      await crearInscripcion(sesionSeleccionada.id, respuestas);
      setExito(true);
      await cargar();
    } catch (e) {
      setErrorInscripcion(mensajeError(e, "No se pudo completar la inscripción."));
    } finally {
      setInscribiendo(false);
    }
  }

  if (cargando) return <Loader />;
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!actividad) return null;

  return (
    <Box>
      <Typography variant="h4" gutterBottom>{actividad.nombre}</Typography>
      {actividad.descripcion_larga && (
        <Typography variant="body1" color="text.secondary" sx={{ mb: 1 }}>
          {actividad.descripcion_larga}
        </Typography>
      )}
      {actividad.informacion_adicional && (
        <Alert severity="info" sx={{ mb: 2 }}>{actividad.informacion_adicional}</Alert>
      )}
      {!actividad.inscripcion_disponible && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Las inscripciones para esta actividad no están abiertas en este momento.
        </Alert>
      )}

      <Typography variant="h6" gutterBottom>Sesiones disponibles</Typography>
      {sesiones.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No hay sesiones programadas por ahora.</Typography>
      ) : (
        <Stack spacing={1.5}>
          {sesiones.map((s) => {
            const sinCupo = s.cupo_maximo !== null && (s.cupos_disponibles ?? 0) <= 0;
            const deshabilitado = !actividad.inscripcion_disponible || sinCupo;
            return (
              <Box key={s.id} sx={{ p: 2, border: 1, borderColor: "divider", borderRadius: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
                  <Box>
                    <Typography variant="body1">
                      {s.fecha} · {s.hora_inicio.slice(0, 5)} - {s.hora_fin.slice(0, 5)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {s.cupo_maximo === null ? "Sin límite de cupo" : `${s.cupos_disponibles} cupo(s) disponible(s) de ${s.cupo_maximo}`}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1} alignItems="center">
                    {sinCupo && <Chip size="small" label="Sin cupo" color="default" />}
                    <Button variant="contained" disabled={deshabilitado} onClick={() => abrirInscripcion(s)}>
                      Inscribirme
                    </Button>
                  </Stack>
                </Stack>
              </Box>
            );
          })}
        </Stack>
      )}

      <Dialog open={!!sesionSeleccionada} onClose={() => setSesionSeleccionada(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{exito ? "¡Listo!" : "Confirmar inscripción"}</DialogTitle>
        <DialogContent>
          {exito ? (
            <DialogContentText>Tu inscripción quedó confirmada.</DialogContentText>
          ) : (
            <Stack spacing={2} sx={{ mt: 1 }}>
              {errorInscripcion && <Alert severity="error">{errorInscripcion}</Alert>}
              <DialogContentText>
                {actividad.nombre} — {sesionSeleccionada?.fecha} {sesionSeleccionada?.hora_inicio.slice(0, 5)}
              </DialogContentText>
              <FormularioDinamico campos={actividad.campos_formulario} valores={respuestas} onChange={setRespuestas} />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          {exito ? (
            <Button onClick={() => setSesionSeleccionada(null)}>Cerrar</Button>
          ) : (
            <>
              <Button onClick={() => setSesionSeleccionada(null)} disabled={inscribiendo}>Cancelar</Button>
              <Button variant="contained" onClick={confirmarInscripcion} disabled={inscribiendo}>
                Confirmar
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      <Dialog open={loginRequerido} onClose={() => setLoginRequerido(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Inicia sesión para inscribirte</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Necesitas iniciar sesión primero (o registrarte si aún no tienes cuenta) para inscribirte a esta actividad.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLoginRequerido(false)}>Cancelar</Button>
          <Button variant="contained" onClick={() => navigate(`/login?next=/actividades/${actividadId}`)}>
            Iniciar sesión
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
