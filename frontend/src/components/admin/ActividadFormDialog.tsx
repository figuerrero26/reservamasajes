import { useEffect, useState } from "react";
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl, FormControlLabel, Grid,
  IconButton, InputLabel, MenuItem, Select, Stack, Switch, TextField, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import type { Actividad, Area, CampoFormulario, TipoCampoFormulario } from "../../types";
import { actualizarActividad, crearActividad } from "../../services/actividades";
import { mensajeError } from "../../utils/errors";
import AreaSelect from "./AreaSelect";

const TIPOS_CAMPO: { value: TipoCampoFormulario; label: string }[] = [
  { value: "texto", label: "Texto" },
  { value: "numero", label: "Número" },
  { value: "si_no", label: "Sí / No" },
  { value: "seleccion", label: "Selección" },
];

interface Formulario {
  areaId: number | "";
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

interface PrimeraSesion {
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  cupo_maximo: string;
  lugar: string;
}

const SESION_VACIA: PrimeraSesion = { fecha: "", hora_inicio: "", hora_fin: "", cupo_maximo: "", lugar: "" };

function aFormulario(a: Actividad | null, areaInicial: number | ""): Formulario {
  return {
    areaId: a ? a.area_id ?? "" : areaInicial,
    nombre: a?.nombre ?? "",
    descripcionCorta: a?.descripcion_corta ?? "",
    descripcionLarga: a?.descripcion_larga ?? "",
    imagenUrl: a?.imagen_url ?? "",
    informacionAdicional: a?.informacion_adicional ?? "",
    inscripcionAbierta: a?.inscripcion_abierta ?? true,
    fechaApertura: a?.fecha_apertura_inscripciones?.slice(0, 16) ?? "",
    fechaCierre: a?.fecha_cierre_inscripciones?.slice(0, 16) ?? "",
    campos: a?.campos_formulario ?? [],
  };
}

interface Props {
  abierto: boolean;
  actividad: Actividad | null;
  areas: Area[];
  areaInicial?: number | "";
  onCerrar: () => void;
  onGuardada: (actividad: Actividad, creada: boolean) => void;
}

/** Actividad con inscripción y cupo. El área es obligatoria y va primero. Al crearla se
 * puede definir de una vez la primera sesión (fecha, horario, cupo y lugar): actividad y
 * sesión se guardan en una sola operación. */
export default function ActividadFormDialog({ abierto, actividad, areas, areaInicial = "", onCerrar, onGuardada }: Props) {
  const [form, setForm] = useState<Formulario>(aFormulario(null, ""));
  const [sesion, setSesion] = useState<PrimeraSesion>(SESION_VACIA);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setForm(aFormulario(actividad, areaInicial));
    setSesion(SESION_VACIA);
    setError(null);
  }, [abierto, actividad, areaInicial]);

  const creando = !actividad;
  const sesionIniciada = Object.values(sesion).some((v) => v.trim() !== "");
  const sesionCompleta = !!sesion.fecha && !!sesion.hora_inicio && !!sesion.hora_fin;
  const clavesRepetidas = new Set(form.campos.map((c) => c.clave)).size !== form.campos.length;
  const ventanaInvalida = !!form.fechaApertura && !!form.fechaCierre && form.fechaCierre <= form.fechaApertura;

  const problema =
    form.areaId === "" ? "Selecciona el área."
      : !form.nombre.trim() ? "Escribe el nombre."
        : clavesRepetidas ? "Cada pregunta debe tener una clave distinta."
          : ventanaInvalida ? "El cierre de inscripciones debe ser posterior a la apertura."
            : form.campos.some((c) => !c.clave.trim() || !c.etiqueta.trim() || (c.tipo === "seleccion" && !(c.opciones ?? []).length))
              ? "Completa las preguntas del formulario."
              : creando && sesionIniciada && !sesionCompleta ? "Completa la fecha y el horario de la primera sesión, o déjala vacía."
                : creando && sesionCompleta && sesion.hora_fin <= sesion.hora_inicio ? "La sesión debe terminar después de empezar."
                  : null;

  const actualizarCampo = (idx: number, cambios: Partial<CampoFormulario>) =>
    setForm({ ...form, campos: form.campos.map((c, i) => (i === idx ? { ...c, ...cambios } : c)) });

  async function guardar() {
    if (problema || form.areaId === "") return;
    setGuardando(true);
    setError(null);
    const payload = {
      area_id: form.areaId,
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
      const guardada = actividad
        ? await actualizarActividad(actividad.id, payload)
        : await crearActividad({
            ...payload,
            sesiones: sesionCompleta ? [{
              fecha: sesion.fecha, hora_inicio: sesion.hora_inicio, hora_fin: sesion.hora_fin,
              cupo_maximo: sesion.cupo_maximo.trim() ? Number(sesion.cupo_maximo) : null,
              lugar: sesion.lugar.trim() || null,
            }] : [],
          });
      onGuardada(guardada, creando);
    } catch (e) {
      setError(mensajeError(e, "No se pudo guardar la actividad."));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={abierto} onClose={() => !guardando && onCerrar()} maxWidth="sm" fullWidth>
      <DialogTitle>{creando ? "Nueva actividad con inscripción" : "Editar actividad"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {actividad && actividad.area_id == null && (
            <Alert severity="warning">Esta actividad se creó antes de que el área fuera obligatoria: asígnale una.</Alert>
          )}
          <Typography variant="overline" color="text.secondary">1 · Área</Typography>
          <AreaSelect areas={areas} valor={form.areaId} onChange={(id) => setForm({ ...form, areaId: id })} />

          <Typography variant="overline" color="text.secondary">2 · Información</Typography>
          <TextField label="Nombre" required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            inputProps={{ maxLength: 160 }} fullWidth />
          <TextField label="Descripción corta" helperText="Se muestra en la tarjeta del portal" value={form.descripcionCorta}
            onChange={(e) => setForm({ ...form, descripcionCorta: e.target.value })} inputProps={{ maxLength: 300 }} fullWidth />
          <TextField label="Descripción larga" value={form.descripcionLarga} multiline minRows={3}
            onChange={(e) => setForm({ ...form, descripcionLarga: e.target.value })} fullWidth />
          <TextField label="URL de la imagen (opcional)" value={form.imagenUrl}
            onChange={(e) => setForm({ ...form, imagenUrl: e.target.value })} fullWidth />
          <TextField label="Información adicional" helperText="Recomendaciones o instrucciones (también va en el correo de confirmación)"
            value={form.informacionAdicional} multiline minRows={2}
            onChange={(e) => setForm({ ...form, informacionAdicional: e.target.value })} fullWidth />

          <Divider />
          <Typography variant="overline" color="text.secondary">3 · Inscripciones</Typography>
          <FormControlLabel
            control={<Switch checked={form.inscripcionAbierta} onChange={(e) => setForm({ ...form, inscripcionAbierta: e.target.checked })} />}
            label="Inscripciones habilitadas"
          />
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField label="Apertura (opcional)" type="datetime-local" value={form.fechaApertura} InputLabelProps={{ shrink: true }}
                onChange={(e) => setForm({ ...form, fechaApertura: e.target.value })} fullWidth />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="Cierre (opcional)" type="datetime-local" value={form.fechaCierre} InputLabelProps={{ shrink: true }}
                onChange={(e) => setForm({ ...form, fechaCierre: e.target.value })} fullWidth
                error={ventanaInvalida} helperText={ventanaInvalida ? "Debe ser posterior a la apertura" : undefined} />
            </Grid>
          </Grid>

          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="subtitle2">Formulario de inscripción</Typography>
              <Button size="small" startIcon={<AddIcon />}
                onClick={() => setForm({ ...form, campos: [...form.campos, { clave: "", etiqueta: "", tipo: "texto", requerido: false, opciones: [] }] })}>
                Agregar pregunta
              </Button>
            </Stack>
            {form.campos.length === 0 && (
              <Typography variant="caption" color="text.secondary">Sin preguntas adicionales: solo se pide confirmar la inscripción.</Typography>
            )}
            <Stack spacing={1.5}>
              {form.campos.map((campo, idx) => (
                <Box key={idx} sx={{ p: 1.5, border: 1, borderColor: "divider", borderRadius: 2 }}>
                  <Grid container spacing={1} alignItems="center">
                    <Grid item xs={12} sm={4}>
                      <TextField size="small" label="Clave" helperText="Identificador interno" value={campo.clave} fullWidth inputProps={{ maxLength: 60 }}
                        onChange={(e) => actualizarCampo(idx, { clave: e.target.value.trim().replace(/\s+/g, "_") })} />
                    </Grid>
                    <Grid item xs={12} sm={5}>
                      <TextField size="small" label="Pregunta" value={campo.etiqueta} fullWidth
                        onChange={(e) => actualizarCampo(idx, { etiqueta: e.target.value })} />
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
                      <IconButton size="small" color="error" aria-label="Quitar pregunta"
                        onClick={() => setForm({ ...form, campos: form.campos.filter((_, i) => i !== idx) })}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Grid>
                    {campo.tipo === "seleccion" && (
                      <Grid item xs={12}>
                        <TextField size="small" label="Opciones (separadas por coma)" fullWidth value={(campo.opciones ?? []).join(", ")}
                          onChange={(e) => actualizarCampo(idx, { opciones: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })} />
                      </Grid>
                    )}
                    <Grid item xs={12}>
                      <FormControlLabel label="Obligatorio"
                        control={<Switch size="small" checked={campo.requerido} onChange={(e) => actualizarCampo(idx, { requerido: e.target.checked })} />} />
                    </Grid>
                  </Grid>
                </Box>
              ))}
            </Stack>
          </Box>

          {creando && (
            <>
              <Divider />
              <Box>
                <Typography variant="overline" color="text.secondary">4 · Primera sesión (opcional)</Typography>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
                  Fecha, horario y cupo. Puedes agregar más sesiones después desde «Sesiones».
                </Typography>
                <Grid container spacing={1.5}>
                  <Grid item xs={12} sm={4}>
                    <TextField label="Fecha" type="date" size="small" fullWidth InputLabelProps={{ shrink: true }}
                      value={sesion.fecha} onChange={(e) => setSesion({ ...sesion, fecha: e.target.value })} />
                  </Grid>
                  <Grid item xs={6} sm={4}>
                    <TextField label="Hora inicio" type="time" size="small" fullWidth InputLabelProps={{ shrink: true }}
                      value={sesion.hora_inicio} onChange={(e) => setSesion({ ...sesion, hora_inicio: e.target.value })} />
                  </Grid>
                  <Grid item xs={6} sm={4}>
                    <TextField label="Hora fin" type="time" size="small" fullWidth InputLabelProps={{ shrink: true }}
                      value={sesion.hora_fin} onChange={(e) => setSesion({ ...sesion, hora_fin: e.target.value })} />
                  </Grid>
                  <Grid item xs={12} sm={7}>
                    <TextField label="Lugar o punto de encuentro" size="small" fullWidth inputProps={{ maxLength: 200 }}
                      value={sesion.lugar} onChange={(e) => setSesion({ ...sesion, lugar: e.target.value })} />
                  </Grid>
                  <Grid item xs={12} sm={5}>
                    <TextField label="Cupo (vacío = sin límite)" type="number" size="small" fullWidth inputProps={{ min: 1 }}
                      value={sesion.cupo_maximo} onChange={(e) => setSesion({ ...sesion, cupo_maximo: e.target.value })} />
                  </Grid>
                </Grid>
              </Box>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCerrar} disabled={guardando}>Cancelar</Button>
        <Button variant="contained" onClick={guardar} disabled={guardando || !!problema}>
          {guardando ? "Guardando…" : creando ? "Crear actividad" : "Guardar"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
