import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import type {
  Actividad, CampoFormulario, EstadoInscripcion, InscripcionAdmin, Sesion, TipoCampoFormulario,
} from "../../types";
import {
  actualizarActividad,
  actualizarSesion,
  crearActividad,
  crearSesion,
  desactivarActividad,
  desactivarSesion,
  generarSesiones,
  listarActividades,
  listarSesiones,
} from "../../services/actividades";
import { buscarInscripciones, cancelarInscripcion, marcarAsistenciaInscripcion } from "../../services/inscripciones";
import { mensajeError } from "../../utils/errors";
import Loader from "../../components/Loader";
import DataTable, { type ColumnaDataTable } from "../../components/DataTable";
import ConfirmDialog from "../../components/ConfirmDialog";

const TIPOS_CAMPO: { value: TipoCampoFormulario; label: string }[] = [
  { value: "texto", label: "Texto" },
  { value: "numero", label: "Número" },
  { value: "si_no", label: "Sí / No" },
  { value: "seleccion", label: "Selección" },
];

const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const ESTILO_ESTADO_INSCRIPCION: Record<EstadoInscripcion, { label: string; color: "primary" | "default" | "success" | "warning" }> = {
  activa: { label: "Activa", color: "primary" },
  cancelada: { label: "Cancelada", color: "default" },
  completada: { label: "Asistió", color: "success" },
  no_asistio: { label: "No asistió", color: "warning" },
};

interface FormularioActividad {
  nombre: string;
  descripcionCorta: string;
  descripcionLarga: string;
  imagenUrl: string;
  informacionAdicional: string;
  inscripcionAbierta: boolean;
  fechaApertura: string;
  fechaCierre: string;
  campos: CampoFormulario[];
}

const FORM_VACIO: FormularioActividad = {
  nombre: "", descripcionCorta: "", descripcionLarga: "", imagenUrl: "", informacionAdicional: "",
  inscripcionAbierta: true, fechaApertura: "", fechaCierre: "", campos: [],
};

function aFormulario(a: Actividad): FormularioActividad {
  return {
    nombre: a.nombre, descripcionCorta: a.descripcion_corta ?? "", descripcionLarga: a.descripcion_larga ?? "",
    imagenUrl: a.imagen_url ?? "", informacionAdicional: a.informacion_adicional ?? "",
    inscripcionAbierta: a.inscripcion_abierta,
    fechaApertura: a.fecha_apertura_inscripciones ? a.fecha_apertura_inscripciones.slice(0, 16) : "",
    fechaCierre: a.fecha_cierre_inscripciones ? a.fecha_cierre_inscripciones.slice(0, 16) : "",
    campos: a.campos_formulario,
  };
}

export default function ActividadesPage() {
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [editando, setEditando] = useState<Actividad | null>(null);
  const [form, setForm] = useState<FormularioActividad>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [errorDialog, setErrorDialog] = useState<string | null>(null);

  // Panel de sesiones de una actividad.
  const [actividadSesiones, setActividadSesiones] = useState<Actividad | null>(null);
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [cargandoSesiones, setCargandoSesiones] = useState(false);
  const [nuevaSesion, setNuevaSesion] = useState({ fecha: "", hora_inicio: "", hora_fin: "", cupo_maximo: "" });
  const [creandoSesion, setCreandoSesion] = useState(false);
  const [errorSesion, setErrorSesion] = useState<string | null>(null);

  const [lote, setLote] = useState({
    fecha_inicio: "", fecha_fin: "", dias: [] as number[], hora_inicio: "", hora_fin: "", cupo_maximo: "",
  });
  const [generando, setGenerando] = useState(false);
  const [errorLote, setErrorLote] = useState<string | null>(null);

  // Inscritos de una sesión puntual.
  const [sesionInscritos, setSesionInscritos] = useState<Sesion | null>(null);
  const [inscritos, setInscritos] = useState<InscripcionAdmin[]>([]);
  const [cargandoInscritos, setCargandoInscritos] = useState(false);
  const [dialogCancelar, setDialogCancelar] = useState<InscripcionAdmin | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [errorCancelar, setErrorCancelar] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      setActividades(await listarActividades());
    } catch (e) {
      setError(mensajeError(e, "No se pudieron cargar las actividades."));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  function abrirCrear() {
    setEditando(null);
    setForm(FORM_VACIO);
    setErrorDialog(null);
    setDialogAbierto(true);
  }

  function abrirEditar(a: Actividad) {
    setEditando(a);
    setForm(aFormulario(a));
    setErrorDialog(null);
    setDialogAbierto(true);
  }

  function agregarCampo() {
    setForm({
      ...form,
      campos: [...form.campos, { clave: "", etiqueta: "", tipo: "texto", requerido: false, opciones: [] }],
    });
  }

  function actualizarCampo(idx: number, cambios: Partial<CampoFormulario>) {
    const campos = form.campos.map((c, i) => (i === idx ? { ...c, ...cambios } : c));
    setForm({ ...form, campos });
  }

  function quitarCampo(idx: number) {
    setForm({ ...form, campos: form.campos.filter((_, i) => i !== idx) });
  }

  const formValido =
    form.nombre.trim() !== "" &&
    form.campos.every((c) => c.clave.trim() && c.etiqueta.trim() && (c.tipo !== "seleccion" || (c.opciones ?? []).length > 0));

  async function guardar() {
    if (!formValido) return;
    setGuardando(true);
    setErrorDialog(null);
    const payload = {
      nombre: form.nombre.trim(),
      descripcion_corta: form.descripcionCorta.trim() || null,
      descripcion_larga: form.descripcionLarga.trim() || null,
      imagen_url: form.imagenUrl.trim() || null,
      informacion_adicional: form.informacionAdicional.trim() || null,
      campos_formulario: form.campos,
      inscripcion_abierta: form.inscripcionAbierta,
      fecha_apertura_inscripciones: form.fechaApertura || null,
      fecha_cierre_inscripciones: form.fechaCierre || null,
    };
    try {
      if (editando) {
        await actualizarActividad(editando.id, payload);
      } else {
        await crearActividad(payload);
      }
      setDialogAbierto(false);
      await cargar();
    } catch (e) {
      setErrorDialog(mensajeError(e, "No se pudo guardar la actividad."));
    } finally {
      setGuardando(false);
    }
  }

  async function alternarEstado(a: Actividad) {
    try {
      if (a.activo) {
        await desactivarActividad(a.id);
      } else {
        await actualizarActividad(a.id, { activo: true });
      }
      await cargar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo cambiar el estado."));
    }
  }

  async function abrirSesiones(a: Actividad) {
    setActividadSesiones(a);
    setNuevaSesion({ fecha: "", hora_inicio: "", hora_fin: "", cupo_maximo: "" });
    setLote({ fecha_inicio: "", fecha_fin: "", dias: [], hora_inicio: "", hora_fin: "", cupo_maximo: "" });
    setErrorSesion(null);
    setErrorLote(null);
    await cargarSesiones(a.id);
  }

  async function cargarSesiones(actividadId: number) {
    setCargandoSesiones(true);
    try {
      setSesiones(await listarSesiones(actividadId));
    } catch (e) {
      setErrorSesion(mensajeError(e, "No se pudieron cargar las sesiones."));
    } finally {
      setCargandoSesiones(false);
    }
  }

  async function crearNuevaSesion() {
    if (!actividadSesiones || !nuevaSesion.fecha || !nuevaSesion.hora_inicio || !nuevaSesion.hora_fin) return;
    setCreandoSesion(true);
    setErrorSesion(null);
    try {
      await crearSesion(actividadSesiones.id, {
        fecha: nuevaSesion.fecha, hora_inicio: nuevaSesion.hora_inicio, hora_fin: nuevaSesion.hora_fin,
        cupo_maximo: nuevaSesion.cupo_maximo ? Number(nuevaSesion.cupo_maximo) : null,
      });
      setNuevaSesion({ fecha: "", hora_inicio: "", hora_fin: "", cupo_maximo: "" });
      await cargarSesiones(actividadSesiones.id);
    } catch (e) {
      setErrorSesion(mensajeError(e, "No se pudo crear la sesión."));
    } finally {
      setCreandoSesion(false);
    }
  }

  async function generarLote() {
    if (!actividadSesiones || !lote.fecha_inicio || !lote.fecha_fin || lote.dias.length === 0 || !lote.hora_inicio || !lote.hora_fin) return;
    setGenerando(true);
    setErrorLote(null);
    try {
      await generarSesiones(actividadSesiones.id, {
        fecha_inicio: lote.fecha_inicio, fecha_fin: lote.fecha_fin, dias_semana: lote.dias,
        hora_inicio: lote.hora_inicio, hora_fin: lote.hora_fin,
        cupo_maximo: lote.cupo_maximo ? Number(lote.cupo_maximo) : null,
      });
      setLote({ fecha_inicio: "", fecha_fin: "", dias: [], hora_inicio: "", hora_fin: "", cupo_maximo: "" });
      await cargarSesiones(actividadSesiones.id);
    } catch (e) {
      setErrorLote(mensajeError(e, "No se pudieron generar las sesiones."));
    } finally {
      setGenerando(false);
    }
  }

  async function alternarEstadoSesion(s: Sesion) {
    if (!actividadSesiones) return;
    try {
      if (s.activa) {
        await desactivarSesion(s.id);
      } else {
        await actualizarSesion(s.id, { activa: true });
      }
      await cargarSesiones(actividadSesiones.id);
    } catch (e) {
      setErrorSesion(mensajeError(e, "No se pudo cambiar el estado de la sesión."));
    }
  }

  async function abrirInscritos(s: Sesion) {
    setSesionInscritos(s);
    setCargandoInscritos(true);
    try {
      setInscritos(await buscarInscripciones({ sesion_id: s.id }));
    } catch {
      setInscritos([]);
    } finally {
      setCargandoInscritos(false);
    }
  }

  async function recargarInscritos() {
    if (!sesionInscritos) return;
    setInscritos(await buscarInscripciones({ sesion_id: sesionInscritos.id }));
    if (actividadSesiones) await cargarSesiones(actividadSesiones.id);
  }

  async function confirmarCancelarInscripcion() {
    if (!dialogCancelar) return;
    setCancelando(true);
    setErrorCancelar(null);
    try {
      await cancelarInscripcion(dialogCancelar.id);
      setDialogCancelar(null);
      await recargarInscritos();
    } catch (e) {
      setErrorCancelar(mensajeError(e, "No se pudo cancelar la inscripción."));
    } finally {
      setCancelando(false);
    }
  }

  async function marcarAsistencia(i: InscripcionAdmin, asistio: boolean) {
    try {
      await marcarAsistenciaInscripcion(i.id, asistio);
      await recargarInscritos();
    } catch (e) {
      setErrorSesion(mensajeError(e, "No se pudo registrar la asistencia."));
    }
  }

  const columnas: ColumnaDataTable<Actividad>[] = [
    { key: "nombre", label: "Nombre" },
    { key: "descripcion_corta", label: "Descripción", render: (a) => a.descripcion_corta || "—" },
    {
      key: "inscripcion",
      label: "Inscripción",
      render: (a) => (
        <Chip size="small" label={a.inscripcion_abierta ? "Abierta" : "Cerrada"} color={a.inscripcion_abierta ? "success" : "default"} />
      ),
    },
    {
      key: "activo",
      label: "Estado",
      render: (a) => <Chip size="small" label={a.activo ? "Activa" : "Inactiva"} color={a.activo ? "success" : "default"} />,
    },
    {
      key: "acciones",
      label: "Acciones",
      align: "right",
      render: (a) => (
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button size="small" onClick={() => abrirSesiones(a)}>
            Sesiones
          </Button>
          <Button size="small" onClick={() => abrirEditar(a)}>
            Editar
          </Button>
          <Button size="small" color={a.activo ? "error" : "primary"} onClick={() => alternarEstado(a)}>
            {a.activo ? "Desactivar" : "Activar"}
          </Button>
        </Stack>
      ),
    },
  ];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" gap={1}>
        <Typography variant="h4">Actividades</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={abrirCrear}>
          Nueva actividad
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {cargando ? (
        <Loader />
      ) : (
        <DataTable columnas={columnas} filas={actividades} obtenerId={(a) => a.id} mensajeVacio="No hay actividades registradas." />
      )}

      {/* Crear / editar actividad */}
      <Dialog open={dialogAbierto} onClose={() => setDialogAbierto(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editando ? "Editar actividad" : "Nueva actividad"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {errorDialog && <Alert severity="error">{errorDialog}</Alert>}
            <TextField label="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} autoFocus fullWidth />
            <TextField
              label="Descripción corta" value={form.descripcionCorta}
              onChange={(e) => setForm({ ...form, descripcionCorta: e.target.value })} fullWidth
            />
            <TextField
              label="Descripción larga" value={form.descripcionLarga}
              onChange={(e) => setForm({ ...form, descripcionLarga: e.target.value })} multiline minRows={2} fullWidth
            />
            <TextField label="URL de la imagen" value={form.imagenUrl} onChange={(e) => setForm({ ...form, imagenUrl: e.target.value })} fullWidth />
            <TextField
              label="Información adicional" value={form.informacionAdicional}
              onChange={(e) => setForm({ ...form, informacionAdicional: e.target.value })} multiline minRows={2} fullWidth
            />

            <FormControlLabel
              control={<Switch checked={form.inscripcionAbierta} onChange={(e) => setForm({ ...form, inscripcionAbierta: e.target.checked })} />}
              label="Inscripciones habilitadas"
            />
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField
                  label="Apertura de inscripciones" type="datetime-local" value={form.fechaApertura}
                  onChange={(e) => setForm({ ...form, fechaApertura: e.target.value })}
                  InputLabelProps={{ shrink: true }} fullWidth
                  helperText="Opcional"
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  label="Cierre de inscripciones" type="datetime-local" value={form.fechaCierre}
                  onChange={(e) => setForm({ ...form, fechaCierre: e.target.value })}
                  InputLabelProps={{ shrink: true }} fullWidth
                  helperText="Opcional"
                />
              </Grid>
            </Grid>

            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="subtitle2">Formulario de inscripción</Typography>
                <Button size="small" startIcon={<AddIcon />} onClick={agregarCampo}>
                  Agregar pregunta
                </Button>
              </Stack>
              {form.campos.length === 0 && (
                <Typography variant="caption" color="text.secondary">
                  Sin preguntas adicionales: solo se pide confirmar la inscripción.
                </Typography>
              )}
              <Stack spacing={2}>
                {form.campos.map((campo, idx) => (
                  <Box key={idx} sx={{ p: 1.5, border: 1, borderColor: "divider", borderRadius: 1 }}>
                    <Grid container spacing={1} alignItems="center">
                      <Grid item xs={12} sm={4}>
                        <TextField
                          size="small" label="Clave" value={campo.clave}
                          onChange={(e) => actualizarCampo(idx, { clave: e.target.value.trim().replace(/\s+/g, "_") })}
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={12} sm={5}>
                        <TextField
                          size="small" label="Pregunta" value={campo.etiqueta}
                          onChange={(e) => actualizarCampo(idx, { etiqueta: e.target.value })}
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={8} sm={2}>
                        <FormControl size="small" fullWidth>
                          <InputLabel>Tipo</InputLabel>
                          <Select
                            label="Tipo" value={campo.tipo}
                            onChange={(e) => actualizarCampo(idx, { tipo: e.target.value as TipoCampoFormulario })}
                          >
                            {TIPOS_CAMPO.map((t) => (
                              <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid item xs={4} sm={1}>
                        <IconButton size="small" color="error" onClick={() => quitarCampo(idx)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Grid>
                      {campo.tipo === "seleccion" && (
                        <Grid item xs={12}>
                          <TextField
                            size="small" label="Opciones (separadas por coma)" fullWidth
                            value={(campo.opciones ?? []).join(", ")}
                            onChange={(e) => actualizarCampo(idx, {
                              opciones: e.target.value.split(",").map((o) => o.trim()).filter(Boolean),
                            })}
                          />
                        </Grid>
                      )}
                      <Grid item xs={12}>
                        <FormControlLabel
                          control={<Switch size="small" checked={campo.requerido} onChange={(e) => actualizarCampo(idx, { requerido: e.target.checked })} />}
                          label="Obligatorio"
                        />
                      </Grid>
                    </Grid>
                  </Box>
                ))}
              </Stack>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogAbierto(false)} disabled={guardando}>Cancelar</Button>
          <Button variant="contained" onClick={guardar} disabled={guardando || !formValido}>Guardar</Button>
        </DialogActions>
      </Dialog>

      {/* Sesiones de una actividad */}
      <Dialog open={!!actividadSesiones} onClose={() => setActividadSesiones(null)} maxWidth="md" fullWidth>
        <DialogTitle>Sesiones de {actividadSesiones?.nombre}</DialogTitle>
        <DialogContent>
          {errorSesion && <Alert severity="error" sx={{ mb: 2 }}>{errorSesion}</Alert>}
          {cargandoSesiones ? (
            <Loader />
          ) : (
            <Stack spacing={1} sx={{ mb: 3 }}>
              {sesiones.length === 0 && (
                <Typography variant="body2" color="text.secondary">Esta actividad todavía no tiene sesiones.</Typography>
              )}
              {sesiones.map((s) => (
                <Box key={s.id} sx={{ p: 1.5, border: 1, borderColor: "divider", borderRadius: 1 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
                    <Box>
                      <Typography variant="body2">
                        {s.fecha} · {s.hora_inicio.slice(0, 5)} - {s.hora_fin.slice(0, 5)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {s.cupo_maximo === null
                          ? `${s.inscritos} inscrito(s) · sin límite de cupo`
                          : `${s.inscritos}/${s.cupo_maximo} inscritos · ${s.cupos_disponibles} disponible(s)`}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Chip size="small" label={s.activa ? "Activa" : "Inactiva"} color={s.activa ? "success" : "default"} />
                      <Button size="small" onClick={() => abrirInscritos(s)}>Ver inscritos</Button>
                      <Button size="small" color={s.activa ? "error" : "primary"} onClick={() => alternarEstadoSesion(s)}>
                        {s.activa ? "Desactivar" : "Activar"}
                      </Button>
                    </Stack>
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}

          <Typography variant="subtitle2" sx={{ mb: 1 }}>Nueva sesión</Typography>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={6} sm={3}>
              <TextField
                label="Fecha" type="date" size="small" fullWidth InputLabelProps={{ shrink: true }}
                value={nuevaSesion.fecha} onChange={(e) => setNuevaSesion({ ...nuevaSesion, fecha: e.target.value })}
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField
                label="Hora inicio" type="time" size="small" fullWidth InputLabelProps={{ shrink: true }}
                value={nuevaSesion.hora_inicio} onChange={(e) => setNuevaSesion({ ...nuevaSesion, hora_inicio: e.target.value })}
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField
                label="Hora fin" type="time" size="small" fullWidth InputLabelProps={{ shrink: true }}
                value={nuevaSesion.hora_fin} onChange={(e) => setNuevaSesion({ ...nuevaSesion, hora_fin: e.target.value })}
              />
            </Grid>
            <Grid item xs={6} sm={2}>
              <TextField
                label="Cupo (vacío = sin límite)" type="number" size="small" fullWidth
                value={nuevaSesion.cupo_maximo} onChange={(e) => setNuevaSesion({ ...nuevaSesion, cupo_maximo: e.target.value })}
              />
            </Grid>
            <Grid item xs={6} sm={1}>
              <Button
                fullWidth variant="contained" sx={{ height: "100%" }}
                disabled={creandoSesion || !nuevaSesion.fecha || !nuevaSesion.hora_inicio || !nuevaSesion.hora_fin}
                onClick={crearNuevaSesion}
              >
                Crear
              </Button>
            </Grid>
          </Grid>

          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Generar varias sesiones (actividades que se repiten)
          </Typography>
          {errorLote && <Alert severity="error" sx={{ mb: 2 }}>{errorLote}</Alert>}
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={6} sm={3}>
              <TextField
                label="Desde" type="date" size="small" fullWidth InputLabelProps={{ shrink: true }}
                value={lote.fecha_inicio} onChange={(e) => setLote({ ...lote, fecha_inicio: e.target.value })}
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField
                label="Hasta" type="date" size="small" fullWidth InputLabelProps={{ shrink: true }}
                value={lote.fecha_fin} onChange={(e) => setLote({ ...lote, fecha_fin: e.target.value })}
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField
                label="Hora inicio" type="time" size="small" fullWidth InputLabelProps={{ shrink: true }}
                value={lote.hora_inicio} onChange={(e) => setLote({ ...lote, hora_inicio: e.target.value })}
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField
                label="Hora fin" type="time" size="small" fullWidth InputLabelProps={{ shrink: true }}
                value={lote.hora_fin} onChange={(e) => setLote({ ...lote, hora_fin: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <Stack direction="row" flexWrap="wrap">
                {DIAS_SEMANA.map((dia, idx) => (
                  <FormControlLabel
                    key={dia}
                    control={
                      <Checkbox
                        size="small"
                        checked={lote.dias.includes(idx)}
                        onChange={(e) =>
                          setLote({
                            ...lote,
                            dias: e.target.checked ? [...lote.dias, idx] : lote.dias.filter((d) => d !== idx),
                          })
                        }
                      />
                    }
                    label={dia}
                  />
                ))}
              </Stack>
            </Grid>
            <Grid item xs={8} sm={4}>
              <TextField
                label="Cupo por sesión (vacío = sin límite)" type="number" size="small" fullWidth
                value={lote.cupo_maximo} onChange={(e) => setLote({ ...lote, cupo_maximo: e.target.value })}
              />
            </Grid>
            <Grid item xs={4} sm={2}>
              <Button
                fullWidth variant="outlined"
                disabled={generando || !lote.fecha_inicio || !lote.fecha_fin || lote.dias.length === 0 || !lote.hora_inicio || !lote.hora_fin}
                onClick={generarLote}
              >
                Generar
              </Button>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActividadSesiones(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* Inscritos de una sesión */}
      <Dialog open={!!sesionInscritos} onClose={() => setSesionInscritos(null)} maxWidth="md" fullWidth>
        <DialogTitle>
          Inscritos — {sesionInscritos?.fecha} {sesionInscritos?.hora_inicio.slice(0, 5)}
        </DialogTitle>
        <DialogContent>
          {cargandoInscritos ? (
            <Loader />
          ) : inscritos.length === 0 ? (
            <Typography variant="body2" color="text.secondary">Nadie se ha inscrito todavía.</Typography>
          ) : (
            <Stack spacing={1}>
              {inscritos.map((i) => (
                <Box key={i.id} sx={{ p: 1.5, border: 1, borderColor: "divider", borderRadius: 1 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
                    <Box>
                      <Typography variant="body2">{i.usuario_nombre} {i.usuario_apellido}</Typography>
                      <Typography variant="caption" color="text.secondary">{i.usuario_correo || "—"}</Typography>
                      {i.respuestas_formulario && Object.keys(i.respuestas_formulario).length > 0 && (
                        <Typography variant="caption" display="block" color="text.secondary">
                          {Object.entries(i.respuestas_formulario).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                        </Typography>
                      )}
                    </Box>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Chip
                        size="small"
                        label={ESTILO_ESTADO_INSCRIPCION[i.estado].label}
                        color={ESTILO_ESTADO_INSCRIPCION[i.estado].color}
                      />
                      {i.estado === "activa" && (
                        <>
                          {i.puede_marcar_asistencia && (
                            <>
                              <Button size="small" color="success" onClick={() => marcarAsistencia(i, true)}>Asistió</Button>
                              <Button size="small" color="warning" onClick={() => marcarAsistencia(i, false)}>No asistió</Button>
                            </>
                          )}
                          <Button size="small" color="error" onClick={() => { setDialogCancelar(i); setErrorCancelar(null); }}>
                            Cancelar
                          </Button>
                        </>
                      )}
                    </Stack>
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSesionInscritos(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        abierto={!!dialogCancelar}
        titulo="Cancelar inscripción"
        contenido={
          dialogCancelar && (
            <span>
              ¿Confirmas cancelar la inscripción de {dialogCancelar.usuario_nombre} {dialogCancelar.usuario_apellido}?
              Esta acción no se puede deshacer.
            </span>
          )
        }
        textoConfirmar="Cancelar inscripción"
        colorConfirmar="error"
        cargando={cancelando}
        error={errorCancelar}
        onConfirmar={confirmarCancelarInscripcion}
        onCancelar={() => setDialogCancelar(null)}
      />
    </Box>
  );
}
