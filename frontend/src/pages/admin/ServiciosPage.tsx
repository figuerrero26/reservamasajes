import { useEffect, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SpaIcon from "@mui/icons-material/Spa";
import type { Servicio } from "../../types";
import { actualizarServicio, crearServicio, desactivarServicio, listarServicios } from "../../services/servicios";
import { mensajeError } from "../../utils/errors";
import Loader from "../../components/Loader";
import DataTable, { type ColumnaDataTable } from "../../components/DataTable";

interface FormularioEvento {
  nombre: string;
  descripcionCorta: string;
  descripcionLarga: string;
  imagenUrl: string;
  duracionMinutos: string;
  informacionAdicional: string;
}

const FORM_VACIO: FormularioEvento = {
  nombre: "",
  descripcionCorta: "",
  descripcionLarga: "",
  imagenUrl: "",
  duracionMinutos: "30",
  informacionAdicional: "",
};

export default function ServiciosPage() {
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [editando, setEditando] = useState<Servicio | null>(null);
  const [form, setForm] = useState<FormularioEvento>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [errorDialog, setErrorDialog] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      setServicios(await listarServicios());
    } catch (e) {
      setError(mensajeError(e, "No se pudieron cargar los eventos."));
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

  function abrirEditar(servicio: Servicio) {
    setEditando(servicio);
    setForm({
      nombre: servicio.nombre,
      descripcionCorta: servicio.descripcion_corta ?? "",
      descripcionLarga: servicio.descripcion_larga ?? "",
      imagenUrl: servicio.imagen_url ?? "",
      duracionMinutos: String(servicio.duracion_minutos),
      informacionAdicional: servicio.informacion_adicional ?? "",
    });
    setErrorDialog(null);
    setDialogAbierto(true);
  }

  const duracionValida = Number(form.duracionMinutos) > 0;
  const formValido = form.nombre.trim() && duracionValida;

  async function guardar() {
    if (!formValido) return;
    setGuardando(true);
    setErrorDialog(null);
    const payload = {
      nombre: form.nombre.trim(),
      descripcion_corta: form.descripcionCorta.trim() || null,
      descripcion_larga: form.descripcionLarga.trim() || null,
      imagen_url: form.imagenUrl.trim() || null,
      duracion_minutos: Number(form.duracionMinutos),
      informacion_adicional: form.informacionAdicional.trim() || null,
    };
    try {
      if (editando) {
        await actualizarServicio(editando.id, payload);
      } else {
        await crearServicio(payload);
      }
      setDialogAbierto(false);
      await cargar();
    } catch (e) {
      setErrorDialog(mensajeError(e, "No se pudo guardar el evento."));
    } finally {
      setGuardando(false);
    }
  }

  async function alternarEstado(servicio: Servicio) {
    try {
      if (servicio.activo) {
        await desactivarServicio(servicio.id);
      } else {
        await actualizarServicio(servicio.id, { activo: true });
      }
      await cargar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo cambiar el estado del evento."));
    }
  }

  const columnas: ColumnaDataTable<Servicio>[] = [
    {
      key: "imagen",
      label: "",
      render: (s) =>
        s.imagen_url ? (
          <Avatar src={s.imagen_url} variant="rounded" sx={{ width: 40, height: 40 }} />
        ) : (
          <Avatar variant="rounded" sx={{ width: 40, height: 40, bgcolor: "primary.main" }}>
            <SpaIcon fontSize="small" />
          </Avatar>
        ),
    },
    { key: "nombre", label: "Nombre" },
    { key: "descripcion_corta", label: "Descripción corta", render: (s) => s.descripcion_corta || "—" },
    { key: "duracion_minutos", label: "Duración", render: (s) => `${s.duracion_minutos} min` },
    {
      key: "activo",
      label: "Estado",
      render: (s) => (
        <Chip size="small" label={s.activo ? "Activo" : "Inactivo"} color={s.activo ? "success" : "default"} />
      ),
    },
    {
      key: "acciones",
      label: "Acciones",
      align: "right",
      render: (s) => (
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button size="small" onClick={() => abrirEditar(s)}>
            Editar
          </Button>
          <Button size="small" color={s.activo ? "error" : "primary"} onClick={() => alternarEstado(s)}>
            {s.activo ? "Desactivar" : "Activar"}
          </Button>
        </Stack>
      ),
    },
  ];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" gap={1}>
        <Typography variant="h4">Eventos</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={abrirCrear}>
          Nuevo evento
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {cargando ? (
        <Loader />
      ) : (
        <DataTable
          columnas={columnas}
          filas={servicios}
          obtenerId={(s) => s.id}
          mensajeVacio="No hay eventos registrados."
        />
      )}

      <Dialog open={dialogAbierto} onClose={() => setDialogAbierto(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editando ? "Editar evento" : "Nuevo evento"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {errorDialog && <Alert severity="error">{errorDialog}</Alert>}
            <TextField
              label="Nombre"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              autoFocus
              fullWidth
            />
            <TextField
              label="Descripción corta"
              helperText="Se muestra en la tarjeta del catálogo"
              value={form.descripcionCorta}
              onChange={(e) => setForm({ ...form, descripcionCorta: e.target.value })}
              fullWidth
            />
            <TextField
              label="Descripción larga"
              helperText="Se muestra en la página de disponibilidad del evento"
              value={form.descripcionLarga}
              onChange={(e) => setForm({ ...form, descripcionLarga: e.target.value })}
              multiline
              minRows={3}
              fullWidth
            />
            <TextField
              label="URL de la imagen"
              value={form.imagenUrl}
              onChange={(e) => setForm({ ...form, imagenUrl: e.target.value })}
              fullWidth
            />
            {form.imagenUrl.trim() && (
              <Box>
                <Avatar src={form.imagenUrl.trim()} variant="rounded" sx={{ width: 96, height: 96 }} />
              </Box>
            )}
            <TextField
              label="Duración (minutos)"
              type="number"
              value={form.duracionMinutos}
              onChange={(e) => setForm({ ...form, duracionMinutos: e.target.value })}
              error={!duracionValida}
              helperText={!duracionValida ? "Debe ser mayor a 0" : undefined}
              fullWidth
            />
            <TextField
              label="Información adicional"
              helperText="Notas o instrucciones extra para el colaborador"
              value={form.informacionAdicional}
              onChange={(e) => setForm({ ...form, informacionAdicional: e.target.value })}
              multiline
              minRows={2}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogAbierto(false)} disabled={guardando}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={guardar} disabled={guardando || !formValido}>
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
