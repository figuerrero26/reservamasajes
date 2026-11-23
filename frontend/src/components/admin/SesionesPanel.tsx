import { useEffect, useState } from "react";
import {
  Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel, Grid, Paper,
  Stack, TextField, Typography, useMediaQuery, useTheme,
} from "@mui/material";
import type { Actividad, Sesion } from "../../types";
import { actualizarSesion, crearSesion, desactivarSesion, generarSesiones, listarSesiones } from "../../services/actividades";
import { mensajeError } from "../../utils/errors";
import { formatearFechaLarga, formatearHora, textoVigencia } from "../../utils/fechas";
import EstadoChip from "../EstadoChip";
import Loader from "../Loader";
import InscritosDialog, { OcupacionSesion } from "./InscritosDialog";

const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

interface FormSesion {
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  cupo_maximo: string;
  lugar: string;
}

const SESION_VACIA: FormSesion = { fecha: "", hora_inicio: "", hora_fin: "", cupo_maximo: "", lugar: "" };
const LOTE_VACIO = { fecha_inicio: "", fecha_fin: "", dias: [] as number[], hora_inicio: "", hora_fin: "", cupo_maximo: "", lugar: "" };

const cupo = (v: string) => (v.trim() ? Number(v) : null);
const sesionValida = (s: FormSesion) =>
  !!s.fecha && !!s.hora_inicio && !!s.hora_fin && s.hora_fin > s.hora_inicio && (!s.cupo_maximo || Number(s.cupo_maximo) >= 1);

interface Props {
  actividad: Actividad;
  /** Tras cualquier cambio en fechas o inscritos (para refrescar el listado de eventos). */
  onCambio: () => void;
}

/** Fechas de realización de un evento de inscripción (fecha, horario, lugar y límite de
 * participantes), con acceso a los inscritos de cada fecha —también de las pasadas y de los
 * eventos finalizados: el historial se conserva—. Se gestiona dentro del propio evento. */
export default function SesionesPanel({ actividad, onCambio }: Props) {
  const theme = useTheme();
  const pantallaChica = useMediaQuery(theme.breakpoints.down("sm"));
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nueva, setNueva] = useState<FormSesion>(SESION_VACIA);
  const [creando, setCreando] = useState(false);
  const [lote, setLote] = useState(LOTE_VACIO);
  const [generando, setGenerando] = useState(false);
  const [errorLote, setErrorLote] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [editando, setEditando] = useState<Sesion | null>(null);
  const [formEdicion, setFormEdicion] = useState<FormSesion>(SESION_VACIA);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null);
  const [sesionInscritos, setSesionInscritos] = useState<Sesion | null>(null);

  async function cargar(actividadId: number): Promise<Sesion[]> {
    setCargando(true);
    try {
      const lista = await listarSesiones(actividadId);
      setSesiones(lista);
      return lista;
    } catch (e) {
      setError(mensajeError(e, "No se pudieron cargar las fechas."));
      return [];
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    setNueva(SESION_VACIA);
    setLote(LOTE_VACIO);
    setError(null);
    setErrorLote(null);
    setAviso(null);
    cargar(actividad.id);
  }, [actividad.id]);

  async function refrescar() {
    await cargar(actividad.id);
    onCambio();
  }

  async function crear() {
    if (!sesionValida(nueva)) return;
    setCreando(true);
    setError(null);
    try {
      await crearSesion(actividad.id, {
        fecha: nueva.fecha, hora_inicio: nueva.hora_inicio, hora_fin: nueva.hora_fin,
        cupo_maximo: cupo(nueva.cupo_maximo), lugar: nueva.lugar.trim() || null,
      });
      setNueva({ ...SESION_VACIA, lugar: nueva.lugar, cupo_maximo: nueva.cupo_maximo });
      setAviso("Fecha agregada.");
      await refrescar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo agregar la fecha."));
    } finally {
      setCreando(false);
    }
  }

  async function generar() {
    if (!lote.fecha_inicio || !lote.fecha_fin || lote.dias.length === 0 || !lote.hora_inicio || !lote.hora_fin) return;
    setGenerando(true);
    setErrorLote(null);
    try {
      const creadas = await generarSesiones(actividad.id, {
        fecha_inicio: lote.fecha_inicio, fecha_fin: lote.fecha_fin, dias_semana: lote.dias,
        hora_inicio: lote.hora_inicio, hora_fin: lote.hora_fin, cupo_maximo: cupo(lote.cupo_maximo), lugar: lote.lugar.trim() || null,
      });
      setLote(LOTE_VACIO);
      setAviso(`${creadas.length} fecha(s) creada(s).`);
      await refrescar();
    } catch (e) {
      setErrorLote(mensajeError(e, "No se pudieron generar las fechas."));
    } finally {
      setGenerando(false);
    }
  }

  async function alternarEstado(s: Sesion) {
    try {
      if (s.activa) await desactivarSesion(s.id);
      else await actualizarSesion(s.id, { activa: true });
      await refrescar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo cambiar el estado de la fecha."));
    }
  }

  function abrirEdicion(s: Sesion) {
    setEditando(s);
    setFormEdicion({
      fecha: s.fecha, hora_inicio: s.hora_inicio.slice(0, 5), hora_fin: s.hora_fin.slice(0, 5),
      cupo_maximo: s.cupo_maximo != null ? String(s.cupo_maximo) : "", lugar: s.lugar ?? "",
    });
    setErrorEdicion(null);
  }

  async function guardarEdicion() {
    if (!editando || !sesionValida(formEdicion)) return;
    setGuardandoEdicion(true);
    setErrorEdicion(null);
    try {
      await actualizarSesion(editando.id, {
        fecha: formEdicion.fecha, hora_inicio: formEdicion.hora_inicio, hora_fin: formEdicion.hora_fin,
        cupo_maximo: cupo(formEdicion.cupo_maximo), lugar: formEdicion.lugar.trim() || null,
      });
      setEditando(null);
      await refrescar();
    } catch (e) {
      setErrorEdicion(mensajeError(e, "No se pudo guardar la fecha."));
    } finally {
      setGuardandoEdicion(false);
    }
  }

  return (
    <Box>
      <Alert severity={actividad.estado_vigencia === "finalizado" ? "info" : "success"} icon={false} sx={{ mb: 2 }}>
        {actividad.estado_vigencia === "finalizado"
          ? "Este evento finalizó: ya no recibe inscripciones nuevas. Sus fechas e inscritos se conservan."
          : `Periodo de inscripción: ${textoVigencia(actividad.vigencia_inicio, actividad.vigencia_fin)?.toLowerCase() ?? "sin definir"}. `
            + "Las fechas no pueden ser anteriores al inicio de ese periodo; si una es posterior a su fin, las inscripciones cierran igual al terminar."}
      </Alert>
      {aviso && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setAviso(null)}>{aviso}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {cargando ? (
        <Loader />
      ) : (
        <Stack spacing={1} sx={{ mb: 3 }}>
          {sesiones.length === 0 && (
            <Alert severity="info">Este evento todavía no tiene fechas: no se muestra en el portal hasta que agregues una.</Alert>
          )}
          {sesiones.map((s) => (
            <Paper key={s.id} variant="outlined" sx={{ p: 1.75 }}>
              <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={1.5}>
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography variant="body2" fontWeight={600}>
                      {formatearFechaLarga(s.fecha)} · {formatearHora(s.hora_inicio)} – {formatearHora(s.hora_fin)}
                    </Typography>
                    <EstadoChip tipo="sesion" estado={s.estado} />
                  </Stack>
                  {s.lugar && <Typography variant="caption" color="text.secondary" display="block">{s.lugar}</Typography>}
                  <Box sx={{ mt: 0.75 }}><OcupacionSesion s={s} /></Box>
                </Box>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ flexShrink: 0 }}>
                  <Button size="small" variant="outlined" onClick={() => setSesionInscritos(s)}>Inscritos ({s.inscritos})</Button>
                  {s.estado !== "finalizada" && <Button size="small" onClick={() => abrirEdicion(s)}>Editar</Button>}
                  {s.estado !== "finalizada" && (
                    <Button size="small" color={s.activa ? "error" : "primary"} onClick={() => alternarEstado(s)}>
                      {s.activa ? "Desactivar" : "Activar"}
                    </Button>
                  )}
                </Stack>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}

      <Divider sx={{ mb: 2 }} />
      <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Agregar una fecha</Typography>
      <Grid container spacing={1.5} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <TextField label="Fecha" type="date" size="small" fullWidth InputLabelProps={{ shrink: true }}
            inputProps={{ min: actividad.vigencia_inicio ?? undefined }}
            value={nueva.fecha} onChange={(e) => setNueva({ ...nueva, fecha: e.target.value })} />
        </Grid>
        <Grid item xs={6} sm={4}>
          <TextField label="Hora inicio" type="time" size="small" fullWidth InputLabelProps={{ shrink: true }}
            value={nueva.hora_inicio} onChange={(e) => setNueva({ ...nueva, hora_inicio: e.target.value })} />
        </Grid>
        <Grid item xs={6} sm={4}>
          <TextField label="Hora fin" type="time" size="small" fullWidth InputLabelProps={{ shrink: true }}
            value={nueva.hora_fin} onChange={(e) => setNueva({ ...nueva, hora_fin: e.target.value })}
            error={!!nueva.hora_fin && !!nueva.hora_inicio && nueva.hora_fin <= nueva.hora_inicio} />
        </Grid>
        <Grid item xs={12} sm={5}>
          <TextField label="Lugar o punto de encuentro" size="small" fullWidth inputProps={{ maxLength: 200 }}
            value={nueva.lugar} onChange={(e) => setNueva({ ...nueva, lugar: e.target.value })} />
        </Grid>
        <Grid item xs={12} sm={4}>
          <TextField label="Límite de participantes" helperText="Vacío = sin límite" type="number" size="small" fullWidth
            inputProps={{ min: 1 }} value={nueva.cupo_maximo} onChange={(e) => setNueva({ ...nueva, cupo_maximo: e.target.value })} />
        </Grid>
        <Grid item xs={12} sm={3}>
          <Button fullWidth variant="contained" disabled={creando || !sesionValida(nueva)} onClick={crear}>Agregar</Button>
        </Grid>
      </Grid>

      <Typography variant="subtitle2" sx={{ mb: 1 }}>Generar varias fechas (actividades que se repiten)</Typography>
      {errorLote && <Alert severity="error" sx={{ mb: 2 }}>{errorLote}</Alert>}
      <Grid container spacing={1.5} alignItems="center">
        <Grid item xs={6} sm={3}>
          <TextField label="Desde" type="date" size="small" fullWidth InputLabelProps={{ shrink: true }}
            inputProps={{ min: actividad.vigencia_inicio ?? undefined }}
            value={lote.fecha_inicio} onChange={(e) => setLote({ ...lote, fecha_inicio: e.target.value })} />
        </Grid>
        <Grid item xs={6} sm={3}>
          <TextField label="Hasta" type="date" size="small" fullWidth InputLabelProps={{ shrink: true }}
            value={lote.fecha_fin} onChange={(e) => setLote({ ...lote, fecha_fin: e.target.value })} />
        </Grid>
        <Grid item xs={6} sm={3}>
          <TextField label="Hora inicio" type="time" size="small" fullWidth InputLabelProps={{ shrink: true }}
            value={lote.hora_inicio} onChange={(e) => setLote({ ...lote, hora_inicio: e.target.value })} />
        </Grid>
        <Grid item xs={6} sm={3}>
          <TextField label="Hora fin" type="time" size="small" fullWidth InputLabelProps={{ shrink: true }}
            value={lote.hora_fin} onChange={(e) => setLote({ ...lote, hora_fin: e.target.value })} />
        </Grid>
        <Grid item xs={12}>
          <Stack direction="row" flexWrap="wrap">
            {DIAS_SEMANA.map((dia, idx) => (
              <FormControlLabel
                key={dia}
                label={dia}
                control={
                  <Checkbox size="small" checked={lote.dias.includes(idx)}
                    onChange={(e) => setLote({ ...lote, dias: e.target.checked ? [...lote.dias, idx] : lote.dias.filter((d) => d !== idx) })} />
                }
              />
            ))}
          </Stack>
        </Grid>
        <Grid item xs={12} sm={5}>
          <TextField label="Lugar" size="small" fullWidth inputProps={{ maxLength: 200 }}
            value={lote.lugar} onChange={(e) => setLote({ ...lote, lugar: e.target.value })} />
        </Grid>
        <Grid item xs={12} sm={4}>
          <TextField label="Límite por fecha" helperText="Vacío = sin límite" type="number" size="small" fullWidth inputProps={{ min: 1 }}
            value={lote.cupo_maximo} onChange={(e) => setLote({ ...lote, cupo_maximo: e.target.value })} />
        </Grid>
        <Grid item xs={12} sm={3}>
          <Button fullWidth variant="outlined" onClick={generar}
            disabled={generando || !lote.fecha_inicio || !lote.fecha_fin || lote.dias.length === 0 || !lote.hora_inicio || !lote.hora_fin}>
            Generar
          </Button>
        </Grid>
      </Grid>

      <Dialog open={!!editando} onClose={() => !guardandoEdicion && setEditando(null)} maxWidth="xs" fullWidth fullScreen={pantallaChica}>
        <DialogTitle>Editar fecha</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {errorEdicion && <Alert severity="error">{errorEdicion}</Alert>}
            {editando && editando.inscritos > 0 && (
              <Alert severity="info">
                Tiene {editando.inscritos} inscrito(s): el límite no puede quedar por debajo de esa cifra. Si cambias la fecha u
                hora, avísales a los participantes.
              </Alert>
            )}
            <TextField label="Fecha" type="date" fullWidth InputLabelProps={{ shrink: true }}
              value={formEdicion.fecha} onChange={(e) => setFormEdicion({ ...formEdicion, fecha: e.target.value })} />
            <Stack direction="row" spacing={2}>
              <TextField label="Hora inicio" type="time" fullWidth InputLabelProps={{ shrink: true }}
                value={formEdicion.hora_inicio} onChange={(e) => setFormEdicion({ ...formEdicion, hora_inicio: e.target.value })} />
              <TextField label="Hora fin" type="time" fullWidth InputLabelProps={{ shrink: true }}
                value={formEdicion.hora_fin} onChange={(e) => setFormEdicion({ ...formEdicion, hora_fin: e.target.value })} />
            </Stack>
            <TextField label="Lugar" fullWidth inputProps={{ maxLength: 200 }}
              value={formEdicion.lugar} onChange={(e) => setFormEdicion({ ...formEdicion, lugar: e.target.value })} />
            <TextField label="Límite de participantes (vacío = sin límite)" type="number" fullWidth
              inputProps={{ min: Math.max(1, editando?.inscritos ?? 1) }}
              value={formEdicion.cupo_maximo} onChange={(e) => setFormEdicion({ ...formEdicion, cupo_maximo: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditando(null)} disabled={guardandoEdicion}>Cancelar</Button>
          <Button variant="contained" onClick={guardarEdicion} disabled={guardandoEdicion || !sesionValida(formEdicion)}>Guardar</Button>
        </DialogActions>
      </Dialog>

      <InscritosDialog
        actividad={actividad}
        sesion={sesionInscritos}
        onCerrar={() => setSesionInscritos(null)}
        onCambio={async () => {
          const lista = await cargar(actividad.id);
          onCambio();
          return lista.find((s) => s.id === sesionInscritos?.id);
        }}
      />
    </Box>
  );
}
