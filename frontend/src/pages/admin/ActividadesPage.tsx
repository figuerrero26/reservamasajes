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
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import DownloadIcon from "@mui/icons-material/Download";
import type { Actividad, CampoFormulario, InscripcionAdmin, Sesion, TipoCampoFormulario } from "../../types";
import {
  activarActividad,
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
import {
  buscarInscripciones, cancelarInscripcion, crearInscripcionManual, marcarAsistenciaInscripcion,
} from "../../services/inscripciones";
import { mensajeError } from "../../utils/errors";
import { descargarCSV, formatearFecha, formatearFechaLarga, formatearHora, nombreDia } from "../../utils/fechas";
import Loader from "../../components/Loader";
import DataTable, { type ColumnaDataTable } from "../../components/DataTable";
import ConfirmDialog from "../../components/ConfirmDialog";
import EstadoChip from "../../components/EstadoChip";
import PageHeader from "../../components/PageHeader";

const TIPOS_CAMPO: { value: TipoCampoFormulario; label: string }[] = [
  { value: "texto", label: "Texto" },
  { value: "numero", label: "Número" },
  { value: "si_no", label: "Sí / No" },
  { value: "seleccion", label: "Selección" },
];

const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

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

interface FormularioSesion {
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  cupo_maximo: string;
  lugar: string;
}

const SESION_VACIA: FormularioSesion = { fecha: "", hora_inicio: "", hora_fin: "", cupo_maximo: "", lugar: "" };
const LOTE_VACIO = { fecha_inicio: "", fecha_fin: "", dias: [] as number[], hora_inicio: "", hora_fin: "", cupo_maximo: "", lugar: "" };

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

const cupo = (v: string) => (v.trim() ? Number(v) : null);
const sesionValida = (s: FormularioSesion) =>
  !!s.fecha && !!s.hora_inicio && !!s.hora_fin && s.hora_fin > s.hora_inicio && (!s.cupo_maximo || Number(s.cupo_maximo) >= 1);

function Ocupacion({ s }: { s: Sesion }) {
  if (s.cupo_maximo == null) return <Typography variant="caption" color="text.secondary">{s.inscritos} inscrito(s) · sin límite</Typography>;
  return (
    <Box sx={{ minWidth: 160 }}>
      <LinearProgress variant="determinate" value={Math.min(100, (s.inscritos / s.cupo_maximo) * 100)} sx={{ height: 5, borderRadius: 3, mb: 0.5 }} />
      <Typography variant="caption" color="text.secondary">{s.inscritos}/{s.cupo_maximo} inscritos · {s.cupos_disponibles} libre(s)</Typography>
    </Box>
  );
}

export default function ActividadesPage() {
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [editando, setEditando] = useState<Actividad | null>(null);
  const [form, setForm] = useState<FormularioActividad>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [errorDialog, setErrorDialog] = useState<string | null>(null);

  // Panel de sesiones de una actividad.
  const [actividadSesiones, setActividadSesiones] = useState<Actividad | null>(null);
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [cargandoSesiones, setCargandoSesiones] = useState(false);
  const [nuevaSesion, setNuevaSesion] = useState<FormularioSesion>(SESION_VACIA);
  const [creandoSesion, setCreandoSesion] = useState(false);
  const [errorSesion, setErrorSesion] = useState<string | null>(null);
  const [lote, setLote] = useState(LOTE_VACIO);
  const [generando, setGenerando] = useState(false);
  const [errorLote, setErrorLote] = useState<string | null>(null);

  // Edición de una sesión puntual.
  const [sesionEditando, setSesionEditando] = useState<Sesion | null>(null);
  const [formSesion, setFormSesion] = useState<FormularioSesion>(SESION_VACIA);
  const [guardandoSesion, setGuardandoSesion] = useState(false);
  const [errorEditarSesion, setErrorEditarSesion] = useState<string | null>(null);

  // Inscritos de una sesión puntual.
  const [sesionInscritos, setSesionInscritos] = useState<Sesion | null>(null);
  const [inscritos, setInscritos] = useState<InscripcionAdmin[]>([]);
  const [cargandoInscritos, setCargandoInscritos] = useState(false);
  const [errorInscritos, setErrorInscritos] = useState<string | null>(null);
  const [correoManual, setCorreoManual] = useState("");
  const [inscribiendo, setInscribiendo] = useState(false);
  const [dialogCancelar, setDialogCancelar] = useState<InscripcionAdmin | null>(null);
  const [motivoCancelar, setMotivoCancelar] = useState("");
  const [notificarCancelar, setNotificarCancelar] = useState(true);
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

  // ---- Actividad ----
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
    setForm({ ...form, campos: [...form.campos, { clave: "", etiqueta: "", tipo: "texto", requerido: false, opciones: [] }] });
  }

  function actualizarCampo(idx: number, cambios: Partial<CampoFormulario>) {
    setForm({ ...form, campos: form.campos.map((c, i) => (i === idx ? { ...c, ...cambios } : c)) });
  }

  function quitarCampo(idx: number) {
    setForm({ ...form, campos: form.campos.filter((_, i) => i !== idx) });
  }

  const clavesRepetidas = new Set(form.campos.map((c) => c.clave)).size !== form.campos.length;
  const ventanaInvalida = !!form.fechaApertura && !!form.fechaCierre && form.fechaCierre <= form.fechaApertura;
  const formValido =
    form.nombre.trim() !== "" && !clavesRepetidas && !ventanaInvalida &&
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
      const guardada = editando ? await actualizarActividad(editando.id, payload) : await crearActividad(payload);
      setDialogAbierto(false);
      await cargar();
      if (!editando) {
        setAviso(`«${guardada.nombre}» creada. Agrega al menos una sesión para publicarla en el portal.`);
        abrirSesiones(guardada);
      }
    } catch (e) {
      setErrorDialog(mensajeError(e, "No se pudo guardar la actividad."));
    } finally {
      setGuardando(false);
    }
  }

  async function alternarEstado(a: Actividad) {
    setAviso(null);
    try {
      if (a.activo) {
        await desactivarActividad(a.id);
        setAviso(
          `«${a.nombre}» se ocultó del portal y no acepta inscripciones.` +
            (a.resumen.inscritos_futuros ? ` Sus ${a.resumen.inscritos_futuros} inscripción(es) futura(s) se conservan.` : ""),
        );
      } else {
        await activarActividad(a.id);
        setAviso(`«${a.nombre}» está activa de nuevo.`);
      }
      await cargar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo cambiar el estado."));
    }
  }

  // ---- Sesiones ----
  async function abrirSesiones(a: Actividad) {
    setActividadSesiones(a);
    setNuevaSesion(SESION_VACIA);
    setLote(LOTE_VACIO);
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

  async function refrescarSesionesYLista() {
    if (actividadSesiones) await cargarSesiones(actividadSesiones.id);
    await cargar();
  }

  async function crearNuevaSesion() {
    if (!actividadSesiones || !sesionValida(nuevaSesion)) return;
    setCreandoSesion(true);
    setErrorSesion(null);
    try {
      await crearSesion(actividadSesiones.id, {
        fecha: nuevaSesion.fecha, hora_inicio: nuevaSesion.hora_inicio, hora_fin: nuevaSesion.hora_fin,
        cupo_maximo: cupo(nuevaSesion.cupo_maximo), lugar: nuevaSesion.lugar.trim() || null,
      });
      setNuevaSesion({ ...SESION_VACIA, lugar: nuevaSesion.lugar, cupo_maximo: nuevaSesion.cupo_maximo });
      await refrescarSesionesYLista();
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
      const creadas = await generarSesiones(actividadSesiones.id, {
        fecha_inicio: lote.fecha_inicio, fecha_fin: lote.fecha_fin, dias_semana: lote.dias,
        hora_inicio: lote.hora_inicio, hora_fin: lote.hora_fin,
        cupo_maximo: cupo(lote.cupo_maximo), lugar: lote.lugar.trim() || null,
      });
      setLote(LOTE_VACIO);
      setAviso(`${creadas.length} sesión(es) creada(s).`);
      await refrescarSesionesYLista();
    } catch (e) {
      setErrorLote(mensajeError(e, "No se pudieron generar las sesiones."));
    } finally {
      setGenerando(false);
    }
  }

  async function alternarEstadoSesion(s: Sesion) {
    try {
      if (s.activa) await desactivarSesion(s.id);
      else await actualizarSesion(s.id, { activa: true });
      await refrescarSesionesYLista();
    } catch (e) {
      setErrorSesion(mensajeError(e, "No se pudo cambiar el estado de la sesión."));
    }
  }

  function abrirEditarSesion(s: Sesion) {
    setSesionEditando(s);
    setFormSesion({
      fecha: s.fecha, hora_inicio: s.hora_inicio.slice(0, 5), hora_fin: s.hora_fin.slice(0, 5),
      cupo_maximo: s.cupo_maximo != null ? String(s.cupo_maximo) : "", lugar: s.lugar ?? "",
    });
    setErrorEditarSesion(null);
  }

  async function guardarSesion() {
    if (!sesionEditando || !sesionValida(formSesion)) return;
    setGuardandoSesion(true);
    setErrorEditarSesion(null);
    try {
      await actualizarSesion(sesionEditando.id, {
        fecha: formSesion.fecha, hora_inicio: formSesion.hora_inicio, hora_fin: formSesion.hora_fin,
        cupo_maximo: cupo(formSesion.cupo_maximo), lugar: formSesion.lugar.trim() || null,
      });
      setSesionEditando(null);
      await refrescarSesionesYLista();
    } catch (e) {
      setErrorEditarSesion(mensajeError(e, "No se pudo guardar la sesión."));
    } finally {
      setGuardandoSesion(false);
    }
  }

  // ---- Inscritos ----
  async function abrirInscritos(s: Sesion) {
    setSesionInscritos(s);
    setCorreoManual("");
    setErrorInscritos(null);
    setCargandoInscritos(true);
    try {
      setInscritos(await buscarInscripciones({ sesion_id: s.id }));
    } catch (e) {
      setInscritos([]);
      setErrorInscritos(mensajeError(e, "No se pudieron cargar los inscritos."));
    } finally {
      setCargandoInscritos(false);
    }
  }

  async function recargarInscritos() {
    if (!sesionInscritos) return;
    setInscritos(await buscarInscripciones({ sesion_id: sesionInscritos.id }));
    if (actividadSesiones) {
      const actualizadas = await listarSesiones(actividadSesiones.id);
      setSesiones(actualizadas);
      setSesionInscritos(actualizadas.find((s) => s.id === sesionInscritos.id) ?? sesionInscritos);
    }
  }

  async function inscribirManual() {
    if (!sesionInscritos || !correoManual.trim()) return;
    setInscribiendo(true);
    setErrorInscritos(null);
    try {
      await crearInscripcionManual({ correo: correoManual.trim(), sesion_id: sesionInscritos.id });
      setCorreoManual("");
      await recargarInscritos();
    } catch (e) {
      setErrorInscritos(mensajeError(e, "No se pudo inscribir al colaborador."));
    } finally {
      setInscribiendo(false);
    }
  }

  async function confirmarCancelarInscripcion() {
    if (!dialogCancelar) return;
    setCancelando(true);
    setErrorCancelar(null);
    try {
      await cancelarInscripcion(dialogCancelar.id, { motivo: motivoCancelar, notificar: notificarCancelar });
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
      setErrorInscritos(mensajeError(e, "No se pudo registrar la asistencia."));
    }
  }

  function exportarInscritos() {
    if (!sesionInscritos || !actividadSesiones) return;
    const preguntas = actividadSesiones.campos_formulario;
    descargarCSV(
      `inscritos-${actividadSesiones.nombre}-${sesionInscritos.fecha}.csv`.replace(/[^\w.-]+/g, "_"),
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

  const etiquetaPregunta = (clave: string) =>
    actividadSesiones?.campos_formulario.find((c) => c.clave === clave)?.etiqueta ?? clave;

  const columnas: ColumnaDataTable<Actividad>[] = [
    { key: "nombre", label: "Actividad", principal: true },
    {
      key: "proxima",
      label: "Próxima sesión",
      render: (a) =>
        a.resumen.proxima_fecha
          ? `${nombreDia(a.resumen.proxima_fecha).slice(0, 3)} ${formatearFecha(a.resumen.proxima_fecha)} · ${formatearHora(a.resumen.proxima_hora_inicio ?? "")}`
          + (a.resumen.sesiones_futuras > 1 ? ` (+${a.resumen.sesiones_futuras - 1})` : "")
          : "—",
    },
    {
      key: "cupos",
      label: "Inscritos",
      render: (a) =>
        `${a.resumen.inscritos_futuros}` + (a.resumen.cupos_disponibles != null ? ` · ${a.resumen.cupos_disponibles} libre(s)` : ""),
    },
    { key: "inscripcion", label: "Inscripción", render: (a) => <EstadoChip tipo="actividad" estado={a.estado_inscripcion} /> },
    {
      key: "activo",
      label: "Publicación",
      render: (a) => <Chip size="small" label={a.activo ? "Publicada" : "Oculta"} color={a.activo ? "success" : "default"} variant={a.activo ? "filled" : "outlined"} />,
    },
    {
      key: "acciones",
      label: "",
      align: "right",
      render: (a) => (
        <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
          <Button size="small" variant="outlined" onClick={() => abrirSesiones(a)}>Sesiones</Button>
          <Button size="small" onClick={() => abrirEditar(a)}>Editar</Button>
          <Button size="small" color={a.activo ? "error" : "primary"} onClick={() => alternarEstado(a)}>
            {a.activo ? "Ocultar" : "Publicar"}
          </Button>
        </Stack>
      ),
    },
  ];

  return (
    <Box>
      <PageHeader
        titulo="Actividades"
        descripcion="Actividades con inscripción y cupo. Cada actividad tiene una o varias sesiones (fecha, hora, lugar y cupo); cuando una sesión llega a su cupo, las inscripciones se cierran solas."
        acciones={<Button variant="contained" startIcon={<AddIcon />} onClick={abrirCrear}>Nueva actividad</Button>}
      />

      {aviso && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setAviso(null)}>{aviso}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {cargando ? (
        <Loader />
      ) : (
        <DataTable columnas={columnas} filas={actividades} obtenerId={(a) => a.id} mensajeVacio="No hay actividades registradas." />
      )}

      {/* Crear / editar actividad */}
      <Dialog open={dialogAbierto} onClose={() => !guardando && setDialogAbierto(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editando ? "Editar actividad" : "Nueva actividad"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {errorDialog && <Alert severity="error">{errorDialog}</Alert>}
            <TextField label="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} autoFocus fullWidth inputProps={{ maxLength: 160 }} />
            <TextField
              label="Descripción corta" helperText="Se muestra en la tarjeta del portal" value={form.descripcionCorta}
              onChange={(e) => setForm({ ...form, descripcionCorta: e.target.value })} fullWidth inputProps={{ maxLength: 300 }}
            />
            <TextField
              label="Descripción larga" value={form.descripcionLarga}
              onChange={(e) => setForm({ ...form, descripcionLarga: e.target.value })} multiline minRows={3} fullWidth
            />
            <TextField label="URL de la imagen" value={form.imagenUrl} onChange={(e) => setForm({ ...form, imagenUrl: e.target.value })} fullWidth />
            <TextField
              label="Información adicional" helperText="Recomendaciones o instrucciones (también va en el correo de confirmación)"
              value={form.informacionAdicional}
              onChange={(e) => setForm({ ...form, informacionAdicional: e.target.value })} multiline minRows={2} fullWidth
            />

            <Divider />
            <Typography variant="subtitle2">Inscripciones</Typography>
            <FormControlLabel
              control={<Switch checked={form.inscripcionAbierta} onChange={(e) => setForm({ ...form, inscripcionAbierta: e.target.checked })} />}
              label="Inscripciones habilitadas"
            />
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Apertura (opcional)" type="datetime-local" value={form.fechaApertura}
                  onChange={(e) => setForm({ ...form, fechaApertura: e.target.value })} InputLabelProps={{ shrink: true }} fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Cierre (opcional)" type="datetime-local" value={form.fechaCierre}
                  onChange={(e) => setForm({ ...form, fechaCierre: e.target.value })} InputLabelProps={{ shrink: true }} fullWidth
                  error={ventanaInvalida} helperText={ventanaInvalida ? "Debe ser posterior a la apertura" : undefined}
                />
              </Grid>
            </Grid>

            <Divider />
            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="subtitle2">Formulario de inscripción</Typography>
                <Button size="small" startIcon={<AddIcon />} onClick={agregarCampo}>Agregar pregunta</Button>
              </Stack>
              {form.campos.length === 0 && (
                <Typography variant="caption" color="text.secondary">
                  Sin preguntas adicionales: solo se pide confirmar la inscripción.
                </Typography>
              )}
              {clavesRepetidas && <Alert severity="warning" sx={{ mb: 1 }}>Cada pregunta debe tener una clave distinta.</Alert>}
              <Stack spacing={2}>
                {form.campos.map((campo, idx) => (
                  <Box key={idx} sx={{ p: 1.5, border: 1, borderColor: "divider", borderRadius: 2 }}>
                    <Grid container spacing={1} alignItems="center">
                      <Grid item xs={12} sm={4}>
                        <TextField
                          size="small" label="Clave" value={campo.clave} helperText="Identificador interno"
                          onChange={(e) => actualizarCampo(idx, { clave: e.target.value.trim().replace(/\s+/g, "_") })}
                          fullWidth inputProps={{ maxLength: 60 }}
                        />
                      </Grid>
                      <Grid item xs={12} sm={5}>
                        <TextField
                          size="small" label="Pregunta" value={campo.etiqueta}
                          onChange={(e) => actualizarCampo(idx, { etiqueta: e.target.value })} fullWidth
                        />
                      </Grid>
                      <Grid item xs={9} sm={2}>
                        <FormControl size="small" fullWidth>
                          <InputLabel>Tipo</InputLabel>
                          <Select label="Tipo" value={campo.tipo} onChange={(e) => actualizarCampo(idx, { tipo: e.target.value as TipoCampoFormulario })}>
                            {TIPOS_CAMPO.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid item xs={3} sm={1}>
                        <IconButton size="small" color="error" aria-label="Quitar pregunta" onClick={() => quitarCampo(idx)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Grid>
                      {campo.tipo === "seleccion" && (
                        <Grid item xs={12}>
                          <TextField
                            size="small" label="Opciones (separadas por coma)" fullWidth
                            value={(campo.opciones ?? []).join(", ")}
                            onChange={(e) => actualizarCampo(idx, { opciones: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })}
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
                <Alert severity="info">Esta actividad todavía no tiene sesiones: no se muestra en el portal hasta que agregues una.</Alert>
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
                      <Box sx={{ mt: 0.75 }}><Ocupacion s={s} /></Box>
                    </Box>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      <Button size="small" variant="outlined" onClick={() => abrirInscritos(s)}>Inscritos ({s.inscritos})</Button>
                      {s.estado !== "finalizada" && <Button size="small" onClick={() => abrirEditarSesion(s)}>Editar</Button>}
                      {s.estado !== "finalizada" && (
                        <Button size="small" color={s.activa ? "error" : "primary"} onClick={() => alternarEstadoSesion(s)}>
                          {s.activa ? "Desactivar" : "Activar"}
                        </Button>
                      )}
                    </Stack>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}

          <Typography variant="subtitle2" sx={{ mb: 1 }}>Nueva sesión</Typography>
          <Grid container spacing={1.5} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={4}>
              <TextField label="Fecha" type="date" size="small" fullWidth InputLabelProps={{ shrink: true }}
                value={nuevaSesion.fecha} onChange={(e) => setNuevaSesion({ ...nuevaSesion, fecha: e.target.value })} />
            </Grid>
            <Grid item xs={6} sm={4}>
              <TextField label="Hora inicio" type="time" size="small" fullWidth InputLabelProps={{ shrink: true }}
                value={nuevaSesion.hora_inicio} onChange={(e) => setNuevaSesion({ ...nuevaSesion, hora_inicio: e.target.value })} />
            </Grid>
            <Grid item xs={6} sm={4}>
              <TextField label="Hora fin" type="time" size="small" fullWidth InputLabelProps={{ shrink: true }}
                value={nuevaSesion.hora_fin} onChange={(e) => setNuevaSesion({ ...nuevaSesion, hora_fin: e.target.value })}
                error={!!nuevaSesion.hora_fin && !!nuevaSesion.hora_inicio && nuevaSesion.hora_fin <= nuevaSesion.hora_inicio} />
            </Grid>
            <Grid item xs={12} sm={5}>
              <TextField label="Lugar o punto de encuentro" size="small" fullWidth inputProps={{ maxLength: 200 }}
                value={nuevaSesion.lugar} onChange={(e) => setNuevaSesion({ ...nuevaSesion, lugar: e.target.value })} />
            </Grid>
            <Grid item xs={8} sm={4}>
              <TextField label="Cupo (vacío = sin límite)" type="number" size="small" fullWidth inputProps={{ min: 1 }}
                value={nuevaSesion.cupo_maximo} onChange={(e) => setNuevaSesion({ ...nuevaSesion, cupo_maximo: e.target.value })} />
            </Grid>
            <Grid item xs={4} sm={3}>
              <Button fullWidth variant="contained" disabled={creandoSesion || !sesionValida(nuevaSesion)} onClick={crearNuevaSesion}>
                Crear
              </Button>
            </Grid>
          </Grid>

          <Typography variant="subtitle2" sx={{ mb: 1 }}>Generar varias sesiones (actividades que se repiten)</Typography>
          {errorLote && <Alert severity="error" sx={{ mb: 2 }}>{errorLote}</Alert>}
          <Grid container spacing={1.5} alignItems="center">
            <Grid item xs={6} sm={3}>
              <TextField label="Desde" type="date" size="small" fullWidth InputLabelProps={{ shrink: true }}
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
                    control={
                      <Checkbox
                        size="small"
                        checked={lote.dias.includes(idx)}
                        onChange={(e) => setLote({ ...lote, dias: e.target.checked ? [...lote.dias, idx] : lote.dias.filter((d) => d !== idx) })}
                      />
                    }
                    label={dia}
                  />
                ))}
              </Stack>
            </Grid>
            <Grid item xs={12} sm={5}>
              <TextField label="Lugar" size="small" fullWidth inputProps={{ maxLength: 200 }}
                value={lote.lugar} onChange={(e) => setLote({ ...lote, lugar: e.target.value })} />
            </Grid>
            <Grid item xs={8} sm={4}>
              <TextField label="Cupo por sesión" type="number" size="small" fullWidth inputProps={{ min: 1 }}
                value={lote.cupo_maximo} onChange={(e) => setLote({ ...lote, cupo_maximo: e.target.value })} />
            </Grid>
            <Grid item xs={4} sm={3}>
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

      {/* Editar sesión */}
      <Dialog open={!!sesionEditando} onClose={() => !guardandoSesion && setSesionEditando(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Editar sesión</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {errorEditarSesion && <Alert severity="error">{errorEditarSesion}</Alert>}
            {sesionEditando && sesionEditando.inscritos > 0 && (
              <Alert severity="info">
                Tiene {sesionEditando.inscritos} inscrito(s): el cupo no puede quedar por debajo de esa cifra. Si cambias la
                fecha u hora, avísales a los participantes.
              </Alert>
            )}
            <TextField label="Fecha" type="date" fullWidth InputLabelProps={{ shrink: true }}
              value={formSesion.fecha} onChange={(e) => setFormSesion({ ...formSesion, fecha: e.target.value })} />
            <Stack direction="row" spacing={2}>
              <TextField label="Hora inicio" type="time" fullWidth InputLabelProps={{ shrink: true }}
                value={formSesion.hora_inicio} onChange={(e) => setFormSesion({ ...formSesion, hora_inicio: e.target.value })} />
              <TextField label="Hora fin" type="time" fullWidth InputLabelProps={{ shrink: true }}
                value={formSesion.hora_fin} onChange={(e) => setFormSesion({ ...formSesion, hora_fin: e.target.value })} />
            </Stack>
            <TextField label="Lugar" fullWidth inputProps={{ maxLength: 200 }}
              value={formSesion.lugar} onChange={(e) => setFormSesion({ ...formSesion, lugar: e.target.value })} />
            <TextField label="Cupo (vacío = sin límite)" type="number" fullWidth inputProps={{ min: Math.max(1, sesionEditando?.inscritos ?? 1) }}
              value={formSesion.cupo_maximo} onChange={(e) => setFormSesion({ ...formSesion, cupo_maximo: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSesionEditando(null)} disabled={guardandoSesion}>Cancelar</Button>
          <Button variant="contained" onClick={guardarSesion} disabled={guardandoSesion || !sesionValida(formSesion)}>Guardar</Button>
        </DialogActions>
      </Dialog>

      {/* Inscritos de una sesión */}
      <Dialog open={!!sesionInscritos} onClose={() => setSesionInscritos(null)} maxWidth="md" fullWidth>
        <DialogTitle>
          Inscritos · {sesionInscritos && `${formatearFechaLarga(sesionInscritos.fecha)} ${formatearHora(sesionInscritos.hora_inicio)}`}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            {sesionInscritos && <Ocupacion s={sesionInscritos} />}
            {errorInscritos && <Alert severity="error">{errorInscritos}</Alert>}
            {sesionInscritos && sesionInscritos.estado !== "finalizada" && (
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <TextField
                  size="small" label="Inscribir colaborador por correo" type="email" fullWidth
                  value={correoManual} onChange={(e) => setCorreoManual(e.target.value)}
                  helperText="El administrador puede inscribir aunque las inscripciones estén cerradas, pero nunca por encima del cupo."
                />
                <Button variant="contained" onClick={inscribirManual} disabled={inscribiendo || !correoManual.trim()} sx={{ flexShrink: 0, alignSelf: { sm: "flex-start" } }}>
                  Inscribir
                </Button>
              </Stack>
            )}
            {cargandoInscritos ? (
              <Loader />
            ) : inscritos.length === 0 ? (
              <Typography variant="body2" color="text.secondary">Nadie se ha inscrito todavía.</Typography>
            ) : (
              <Stack spacing={1}>
                {inscritos.map((i) => (
                  <Paper key={i.id} variant="outlined" sx={{ p: 1.5 }}>
                    <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={1}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600}>{i.usuario_nombre} {i.usuario_apellido}</Typography>
                        <Typography variant="caption" color="text.secondary">{i.usuario_correo || "—"}</Typography>
                        {i.respuestas_formulario && Object.keys(i.respuestas_formulario).length > 0 && (
                          <Typography variant="caption" display="block" color="text.secondary">
                            {Object.entries(i.respuestas_formulario)
                              .map(([k, v]) => `${etiquetaPregunta(k)}: ${typeof v === "boolean" ? (v ? "Sí" : "No") : v}`)
                              .join(" · ")}
                          </Typography>
                        )}
                      </Box>
                      <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
                        <EstadoChip tipo="inscripcion" estado={i.estado} />
                        {i.estado === "activa" && i.puede_marcar_asistencia && (
                          <>
                            <Button size="small" color="success" onClick={() => marcarAsistencia(i, true)}>Asistió</Button>
                            <Button size="small" color="warning" onClick={() => marcarAsistencia(i, false)}>No asistió</Button>
                          </>
                        )}
                        {i.estado === "activa" && (
                          <Button
                            size="small"
                            color="error"
                            onClick={() => { setDialogCancelar(i); setErrorCancelar(null); setMotivoCancelar(""); setNotificarCancelar(true); }}
                          >
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
          <Button startIcon={<DownloadIcon />} onClick={exportarInscritos} disabled={inscritos.length === 0}>Exportar CSV</Button>
          <Button onClick={() => setSesionInscritos(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        abierto={!!dialogCancelar}
        titulo="Cancelar inscripción"
        contenido={
          dialogCancelar && (
            <Stack spacing={2}>
              <span>
                ¿Confirmas cancelar la inscripción de {dialogCancelar.usuario_nombre} {dialogCancelar.usuario_apellido}? Su cupo
                quedará libre. Esta acción no se puede deshacer.
              </span>
              <TextField
                label="Motivo (opcional, se incluye en el correo)" size="small" fullWidth inputProps={{ maxLength: 500 }}
                value={motivoCancelar} onChange={(e) => setMotivoCancelar(e.target.value)}
              />
              <FormControlLabel
                control={<Switch checked={notificarCancelar} onChange={(e) => setNotificarCancelar(e.target.checked)} />}
                label="Avisar al participante por correo"
              />
            </Stack>
          )
        }
        textoConfirmar="Cancelar inscripción"
        colorConfirmar="error"
        cargando={cancelando}
        error={errorCancelar}
        onConfirmar={confirmarCancelarInscripcion}
        onCancelar={() => !cancelando && setDialogCancelar(null)}
      />
    </Box>
  );
}
