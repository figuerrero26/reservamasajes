import { useEffect, useState } from "react";
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, LinearProgress, Paper,
  Stack, Switch, TextField, Typography,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import type { Actividad, InscripcionAdmin, Sesion } from "../../types";
import { buscarInscripciones, cancelarInscripcion, crearInscripcionManual } from "../../services/inscripciones";
import { mensajeError } from "../../utils/errors";
import { descargarCSV, formatearFechaLarga, formatearHora } from "../../utils/fechas";
import ConfirmDialog from "../ConfirmDialog";
import EstadoChip from "../EstadoChip";
import Loader from "../Loader";

export function OcupacionSesion({ s }: { s: Sesion }) {
  if (s.cupo_maximo == null) {
    return <Typography variant="caption" color="text.secondary">{s.inscritos} inscrito(s) · sin límite</Typography>;
  }
  return (
    <Box sx={{ minWidth: 160 }}>
      <LinearProgress variant="determinate" value={Math.min(100, (s.inscritos / s.cupo_maximo) * 100)} sx={{ height: 5, borderRadius: 3, mb: 0.5 }} />
      <Typography variant="caption" color="text.secondary">{s.inscritos}/{s.cupo_maximo} inscritos · {s.cupos_disponibles} libre(s)</Typography>
    </Box>
  );
}

interface Props {
  actividad: Actividad;
  sesion: Sesion | null;
  onCerrar: () => void;
  /** Tras inscribir o cancelar (para refrescar cupos). */
  onCambio: () => Promise<Sesion | undefined>;
}

/** Personas inscritas en una sesión: consulta, inscripción manual (nunca por encima del
 * cupo), cancelación con aviso por correo y exportación a CSV. No se valida asistencia. */
export default function InscritosDialog({ actividad, sesion, onCerrar, onCambio }: Props) {
  const [actual, setActual] = useState<Sesion | null>(sesion);
  const [inscritos, setInscritos] = useState<InscripcionAdmin[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correo, setCorreo] = useState("");
  const [inscribiendo, setInscribiendo] = useState(false);
  const [aCancelar, setACancelar] = useState<InscripcionAdmin | null>(null);
  const [motivo, setMotivo] = useState("");
  const [notificar, setNotificar] = useState(true);
  const [cancelando, setCancelando] = useState(false);
  const [errorCancelar, setErrorCancelar] = useState<string | null>(null);
  // Mismo criterio que el historial de Reservas: por defecto solo confirmados.
  const [mostrarTodos, setMostrarTodos] = useState(false);

  async function cargar(id: number) {
    setCargando(true);
    try {
      setInscritos(await buscarInscripciones({ sesion_id: id }));
    } catch (e) {
      setError(mensajeError(e, "No se pudieron cargar los inscritos."));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    setActual(sesion);
    setCorreo("");
    setError(null);
    setMostrarTodos(false);
    if (sesion) cargar(sesion.id);
  }, [sesion]);

  async function refrescar() {
    if (!actual) return;
    await cargar(actual.id);
    const nueva = await onCambio();
    if (nueva) setActual(nueva);
  }

  async function inscribir() {
    if (!actual || !correo.trim()) return;
    setInscribiendo(true);
    setError(null);
    try {
      await crearInscripcionManual({ correo: correo.trim(), sesion_id: actual.id });
      setCorreo("");
      await refrescar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo inscribir al colaborador."));
    } finally {
      setInscribiendo(false);
    }
  }

  async function confirmarCancelacion() {
    if (!aCancelar) return;
    setCancelando(true);
    setErrorCancelar(null);
    try {
      await cancelarInscripcion(aCancelar.id, { motivo, notificar });
      setACancelar(null);
      await refrescar();
    } catch (e) {
      setErrorCancelar(mensajeError(e, "No se pudo cancelar la inscripción."));
    } finally {
      setCancelando(false);
    }
  }

  const etiqueta = (clave: string) => actividad.campos_formulario.find((c) => c.clave === clave)?.etiqueta ?? clave;
  const confirmados = inscritos.filter((i) => i.estado === "activa");
  const visibles = mostrarTodos ? inscritos : confirmados;

  function exportar() {
    if (!actual) return;
    const preguntas = actividad.campos_formulario;
    descargarCSV(
      `inscritos-${actividad.nombre}-${actual.fecha}.csv`.replace(/[^\w.-]+/g, "_"),
      ["Nombre", "Apellido", "Correo", "Estado", "Inscrito el", ...preguntas.map((p) => p.etiqueta)],
      inscritos.map((i) => [
        i.usuario_nombre, i.usuario_apellido, i.usuario_correo, i.estado, i.created_at.slice(0, 16).replace("T", " "),
        ...preguntas.map((p) => {
          const v = i.respuestas_formulario?.[p.clave];
          return typeof v === "boolean" ? (v ? "Sí" : "No") : (v ?? "");
        }),
      ]),
    );
  }

  return (
    <>
      <Dialog open={!!sesion} onClose={onCerrar} maxWidth="md" fullWidth>
        <DialogTitle>
          Inscritos · {actual && `${formatearFechaLarga(actual.fecha)} ${formatearHora(actual.hora_inicio)}`}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            {actual && <OcupacionSesion s={actual} />}
            {error && <Alert severity="error">{error}</Alert>}
            {actual && actual.estado !== "finalizada" && (
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <TextField
                  size="small" type="email" fullWidth label="Inscribir colaborador por correo"
                  value={correo} onChange={(e) => setCorreo(e.target.value)}
                  helperText="Se puede inscribir aunque las inscripciones estén cerradas, pero nunca por encima del cupo."
                />
                <Button variant="contained" onClick={inscribir} disabled={inscribiendo || !correo.trim()} sx={{ flexShrink: 0, alignSelf: { sm: "flex-start" } }}>
                  Inscribir
                </Button>
              </Stack>
            )}
            {inscritos.length > 0 && (
              <Stack direction="row" spacing={1}>
                <Chip label={`Confirmados (${confirmados.length})`} size="small" onClick={() => setMostrarTodos(false)}
                  color={!mostrarTodos ? "primary" : "default"} variant={!mostrarTodos ? "filled" : "outlined"} />
                <Chip label={`Todos (${inscritos.length})`} size="small" onClick={() => setMostrarTodos(true)}
                  color={mostrarTodos ? "primary" : "default"} variant={mostrarTodos ? "filled" : "outlined"} />
              </Stack>
            )}
            {cargando ? (
              <Loader />
            ) : visibles.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {inscritos.length === 0 ? "Nadie se ha inscrito todavía." : "Nadie confirmado con ese filtro."}
              </Typography>
            ) : (
              <Stack spacing={1}>
                {visibles.map((i) => (
                  <Paper key={i.id} variant="outlined" sx={{ p: 1.5 }}>
                    <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={1}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600}>{i.usuario_nombre} {i.usuario_apellido}</Typography>
                        <Typography variant="caption" color="text.secondary">{i.usuario_correo || "—"}</Typography>
                        {i.respuestas_formulario && Object.keys(i.respuestas_formulario).length > 0 && (
                          <Typography variant="caption" display="block" color="text.secondary">
                            {Object.entries(i.respuestas_formulario)
                              .map(([k, v]) => `${etiqueta(k)}: ${typeof v === "boolean" ? (v ? "Sí" : "No") : v}`)
                              .join(" · ")}
                          </Typography>
                        )}
                      </Box>
                      <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
                        <EstadoChip tipo="inscripcion" estado={i.estado} />
                        {i.estado === "activa" && (
                          <Button size="small" color="error"
                            onClick={() => { setACancelar(i); setErrorCancelar(null); setMotivo(""); setNotificar(true); }}>
                            Cancelar
                          </Button>
                        )}
                      </Stack>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button startIcon={<DownloadIcon />} onClick={exportar} disabled={inscritos.length === 0}>Exportar CSV</Button>
          <Button onClick={onCerrar}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        abierto={!!aCancelar}
        titulo="Cancelar inscripción"
        contenido={aCancelar && (
          <Stack spacing={2}>
            <span>
              ¿Confirmas cancelar la inscripción de {aCancelar.usuario_nombre} {aCancelar.usuario_apellido}? Su cupo quedará
              libre. Esta acción no se puede deshacer.
            </span>
            <TextField label="Motivo (opcional, se incluye en el correo)" size="small" fullWidth inputProps={{ maxLength: 500 }}
              value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            <FormControlLabel control={<Switch checked={notificar} onChange={(e) => setNotificar(e.target.checked)} />}
              label="Avisar al participante por correo" />
          </Stack>
        )}
        textoConfirmar="Cancelar inscripción"
        colorConfirmar="error"
        cargando={cancelando}
        error={errorCancelar}
        onConfirmar={confirmarCancelacion}
        onCancelar={() => !cancelando && setACancelar(null)}
      />
    </>
  );
}
