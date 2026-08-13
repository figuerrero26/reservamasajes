import { useEffect, useState } from "react";
import {
  Alert,
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
import type { Area } from "../../types";
import { actualizarArea, crearArea, desactivarArea, listarAreas } from "../../services/areas";
import { mensajeError } from "../../utils/errors";
import Loader from "../../components/Loader";
import DataTable, { type ColumnaDataTable } from "../../components/DataTable";

export default function AreasPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [editando, setEditando] = useState<Area | null>(null);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorDialog, setErrorDialog] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      setAreas(await listarAreas());
    } catch (e) {
      setError(mensajeError(e, "No se pudieron cargar las áreas."));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  function abrirCrear() {
    setEditando(null);
    setNombre("");
    setDescripcion("");
    setErrorDialog(null);
    setDialogAbierto(true);
  }

  function abrirEditar(area: Area) {
    setEditando(area);
    setNombre(area.nombre);
    setDescripcion(area.descripcion ?? "");
    setErrorDialog(null);
    setDialogAbierto(true);
  }

  async function guardar() {
    if (!nombre.trim()) return;
    setGuardando(true);
    setErrorDialog(null);
    try {
      if (editando) {
        await actualizarArea(editando.id, { nombre: nombre.trim(), descripcion: descripcion.trim() || null });
      } else {
        await crearArea({ nombre: nombre.trim(), descripcion: descripcion.trim() || undefined });
      }
      setDialogAbierto(false);
      await cargar();
    } catch (e) {
      setErrorDialog(mensajeError(e, "No se pudo guardar el área."));
    } finally {
      setGuardando(false);
    }
  }

  async function alternarEstado(area: Area) {
    try {
      if (area.activo) {
        await desactivarArea(area.id);
      } else {
        await actualizarArea(area.id, { activo: true });
      }
      await cargar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo cambiar el estado del área."));
    }
  }

  const columnas: ColumnaDataTable<Area>[] = [
    { key: "nombre", label: "Nombre" },
    { key: "descripcion", label: "Descripción", render: (a) => a.descripcion || "—" },
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
        <Typography variant="h4">Áreas</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={abrirCrear}>
          Nueva área
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {cargando ? (
        <Loader />
      ) : (
        <DataTable columnas={columnas} filas={areas} obtenerId={(a) => a.id} mensajeVacio="No hay áreas registradas." />
      )}

      <Dialog open={dialogAbierto} onClose={() => setDialogAbierto(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{editando ? "Editar área" : "Nueva área"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {errorDialog && <Alert severity="error">{errorDialog}</Alert>}
            <TextField
              label="Nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              autoFocus
              fullWidth
            />
            <TextField
              label="Descripción"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
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
          <Button variant="contained" onClick={guardar} disabled={guardando || !nombre.trim()}>
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
