import { useEffect, useMemo, useState } from "react";
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
  FormGroup,
  FormHelperText,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import type { Agenda, Area, Servicio } from "../../types";
import { listarAreas } from "../../services/areas";
import { listarServicios } from "../../services/servicios";
import {
  actualizarAgenda,
  cambiarEstadoAgenda,
  crearAgenda,
  listarAgendas,
  type AgendaPayload,
} from "../../services/agendas";
import { mensajeError } from "../../utils/errors";
import Loader from "../../components/Loader";
import DataTable, { type ColumnaDataTable } from "../../components/DataTable";

const DIAS = [
  { valor: 0, etiqueta: "Lun" },
  { valor: 1, etiqueta: "Mar" },
  { valor: 2, etiqueta: "Mié" },
  { valor: 3, etiqueta: "Jue" },
  { valor: 4, etiqueta: "Vie" },
  { valor: 5, etiqueta: "Sáb" },
  { valor: 6, etiqueta: "Dom" },
];

interface FormularioAgenda {
  nombre: string;
  area_id: number | "";
  servicio_id: number | "";
  hora_inicio: string;
  hora_fin: string;
  almuerzo_inicio: string;
  almuerzo_fin: string;
  duracion_minutos: string;
  dias: Set<number>;
  activo: boolean;
}

const FORM_VACIO: FormularioAgenda = {
  nombre: "",
  area_id: "",
  servicio_id: "",
  hora_inicio: "",
  hora_fin: "",
  almuerzo_inicio: "",
  almuerzo_fin: "",
  duracion_minutos: "",
  dias: new Set(),
  activo: true,
};

function parsearDias(csv: string): Set<number> {
  return new Set(
    csv
      .split(",")
      .map((v) => parseInt(v.trim(), 10))
      .filter((v) => !Number.isNaN(v))
  );
}

export default function AgendasPage() {
  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [editando, setEditando] = useState<Agenda | null>(null);
  const [form, setForm] = useState<FormularioAgenda>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [errorDialog, setErrorDialog] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const [a, ar, sv] = await Promise.all([listarAgendas(), listarAreas(), listarServicios()]);
      setAgendas(a);
      setAreas(ar);
      setServicios(sv);
    } catch (e) {
      setError(mensajeError(e, "No se pudo cargar la información de agendas."));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  const nombreArea = (id: number) => areas.find((a) => a.id === id)?.nombre ?? `#${id}`;
  const nombreServicio = (id: number) => servicios.find((s) => s.id === id)?.nombre ?? `#${id}`;

  // Las áreas/servicios activos son las opciones normales; si se edita una agenda cuya
  // área/servicio ya fue desactivado, se incluye igual para no romper el formulario.
  const opcionesArea = useMemo(() => {
    const activas = areas.filter((a) => a.activo);
    if (form.area_id !== "" && !activas.some((a) => a.id === form.area_id)) {
      const actual = areas.find((a) => a.id === form.area_id);
      if (actual) return [...activas, actual];
    }
    return activas;
  }, [areas, form.area_id]);

  const opcionesServicio = useMemo(() => {
    const activos = servicios.filter((s) => s.activo);
    if (form.servicio_id !== "" && !activos.some((s) => s.id === form.servicio_id)) {
      const actual = servicios.find((s) => s.id === form.servicio_id);
      if (actual) return [...activos, actual];
    }
    return activos;
  }, [servicios, form.servicio_id]);

  function abrirCrear() {
    setEditando(null);
    setForm(FORM_VACIO);
    setErrorDialog(null);
    setDialogAbierto(true);
  }

  function abrirEditar(agenda: Agenda) {
    setEditando(agenda);
    setForm({
      nombre: agenda.nombre,
      area_id: agenda.area_id,
      servicio_id: agenda.servicio_id,
      hora_inicio: agenda.hora_inicio?.slice(0, 5) ?? "",
      hora_fin: agenda.hora_fin?.slice(0, 5) ?? "",
      almuerzo_inicio: agenda.almuerzo_inicio?.slice(0, 5) ?? "",
      almuerzo_fin: agenda.almuerzo_fin?.slice(0, 5) ?? "",
      duracion_minutos: String(agenda.duracion_minutos ?? ""),
      dias: parsearDias(agenda.dias_habilitados ?? ""),
      activo: agenda.activo,
    });
    setErrorDialog(null);
    setDialogAbierto(true);
  }

  function alternarDia(dia: number) {
    setForm((f) => {
      const dias = new Set(f.dias);
      if (dias.has(dia)) dias.delete(dia);
      else dias.add(dia);
      return { ...f, dias };
    });
  }

  const formularioValido =
    form.nombre.trim() !== "" &&
    form.area_id !== "" &&
    form.servicio_id !== "" &&
    form.hora_inicio !== "" &&
    form.hora_fin !== "" &&
    form.duracion_minutos !== "" &&
    Number(form.duracion_minutos) > 0 &&
    form.dias.size > 0;

  async function guardar() {
    if (!formularioValido) return;
    setGuardando(true);
    setErrorDialog(null);
    const payload: AgendaPayload = {
      nombre: form.nombre.trim(),
      area_id: Number(form.area_id),
      servicio_id: Number(form.servicio_id),
      hora_inicio: form.hora_inicio,
      hora_fin: form.hora_fin,
      almuerzo_inicio: form.almuerzo_inicio || null,
      almuerzo_fin: form.almuerzo_fin || null,
      duracion_minutos: Number(form.duracion_minutos),
      dias_habilitados: Array.from(form.dias).sort((a, b) => a - b).join(","),
      activo: form.activo,
    };
    try {
      if (editando) {
        await actualizarAgenda(editando.id, payload);
      } else {
        await crearAgenda(payload);
      }
      setDialogAbierto(false);
      await cargar();
    } catch (e) {
      setErrorDialog(mensajeError(e, "No se pudo guardar la agenda."));
    } finally {
      setGuardando(false);
    }
  }

  async function alternarEstadoAgenda(agenda: Agenda) {
    try {
      await cambiarEstadoAgenda(agenda.id, !agenda.activo);
      await cargar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo cambiar el estado de la agenda."));
    }
  }

  const columnas: ColumnaDataTable<Agenda>[] = [
    { key: "nombre", label: "Nombre" },
    { key: "area", label: "Área", render: (a) => nombreArea(a.area_id) },
    { key: "servicio", label: "Servicio", render: (a) => nombreServicio(a.servicio_id) },
    {
      key: "horario",
      label: "Horario",
      render: (a) => `${a.hora_inicio?.slice(0, 5)} – ${a.hora_fin?.slice(0, 5)}`,
    },
    { key: "duracion_minutos", label: "Duración", render: (a) => `${a.duracion_minutos} min` },
    {
      key: "activo",
      label: "Estado",
      render: (a) => (
        <Chip size="small" label={a.activo ? "Activa" : "Inactiva"} color={a.activo ? "success" : "default"} />
      ),
    },
    {
      key: "acciones",
      label: "Acciones",
      align: "right",
      render: (a) => (
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button size="small" onClick={() => abrirEditar(a)}>
            Editar
          </Button>
          <Button size="small" color={a.activo ? "error" : "primary"} onClick={() => alternarEstadoAgenda(a)}>
            {a.activo ? "Desactivar" : "Activar"}
          </Button>
        </Stack>
      ),
    },
  ];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" gap={1}>
        <Typography variant="h4">Agendas</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={abrirCrear}>
          Nueva agenda
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {cargando ? (
        <Loader />
      ) : (
        <DataTable
          columnas={columnas}
          filas={agendas}
          obtenerId={(a) => a.id}
          mensajeVacio="No hay agendas registradas. Crea un área y un servicio primero."
        />
      )}

      <Dialog open={dialogAbierto} onClose={() => setDialogAbierto(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editando ? "Editar agenda" : "Nueva agenda"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {errorDialog && <Alert severity="error">{errorDialog}</Alert>}

            <TextField
              label="Nombre"
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              autoFocus
              fullWidth
            />

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel id="agenda-area-label">Área</InputLabel>
                  <Select
                    labelId="agenda-area-label"
                    label="Área"
                    value={form.area_id}
                    onChange={(e) => setForm((f) => ({ ...f, area_id: Number(e.target.value) }))}
                  >
                    {opcionesArea.map((a) => (
                      <MenuItem key={a.id} value={a.id}>
                        {a.nombre}
                      </MenuItem>
                    ))}
                  </Select>
                  {opcionesArea.length === 0 && (
                    <FormHelperText>No hay áreas activas. Crea una primero.</FormHelperText>
                  )}
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel id="agenda-servicio-label">Servicio</InputLabel>
                  <Select
                    labelId="agenda-servicio-label"
                    label="Servicio"
                    value={form.servicio_id}
                    onChange={(e) => setForm((f) => ({ ...f, servicio_id: Number(e.target.value) }))}
                  >
                    {opcionesServicio.map((s) => (
                      <MenuItem key={s.id} value={s.id}>
                        {s.nombre}
                      </MenuItem>
                    ))}
                  </Select>
                  {opcionesServicio.length === 0 && (
                    <FormHelperText>No hay servicios activos. Crea uno primero.</FormHelperText>
                  )}
                </FormControl>
              </Grid>

              <Grid item xs={6} sm={3}>
                <TextField
                  label="Hora inicio"
                  type="time"
                  value={form.hora_inicio}
                  onChange={(e) => setForm((f) => ({ ...f, hora_inicio: e.target.value }))}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={6} sm={3}>
                <TextField
                  label="Hora fin"
                  type="time"
                  value={form.hora_fin}
                  onChange={(e) => setForm((f) => ({ ...f, hora_fin: e.target.value }))}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={6} sm={3}>
                <TextField
                  label="Almuerzo desde"
                  type="time"
                  value={form.almuerzo_inicio}
                  onChange={(e) => setForm((f) => ({ ...f, almuerzo_inicio: e.target.value }))}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={6} sm={3}>
                <TextField
                  label="Almuerzo hasta"
                  type="time"
                  value={form.almuerzo_fin}
                  onChange={(e) => setForm((f) => ({ ...f, almuerzo_fin: e.target.value }))}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  label="Duración por turno (minutos)"
                  type="number"
                  value={form.duracion_minutos}
                  onChange={(e) => setForm((f) => ({ ...f, duracion_minutos: e.target.value }))}
                  fullWidth
                  inputProps={{ min: 1 }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={form.activo}
                      onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
                    />
                  }
                  label={form.activo ? "Activa" : "Inactiva"}
                />
              </Grid>
            </Grid>

            <Box>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                Días habilitados
              </Typography>
              <FormGroup row>
                {DIAS.map((d) => (
                  <FormControlLabel
                    key={d.valor}
                    control={<Checkbox checked={form.dias.has(d.valor)} onChange={() => alternarDia(d.valor)} />}
                    label={d.etiqueta}
                  />
                ))}
              </FormGroup>
              {form.dias.size === 0 && (
                <FormHelperText error>Selecciona al menos un día.</FormHelperText>
              )}
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogAbierto(false)} disabled={guardando}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={guardar} disabled={guardando || !formularioValido}>
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
