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
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import type { Festivo, ReservaAdmin } from "../../types";
import {
  actualizarFestivo, crearFestivo, eliminarFestivo, listarFestivos, reservasAfectadasFestivo,
} from "../../services/festivos";
import PageHeader from "../../components/PageHeader";
import ReservasAfectadasDialog from "../../components/ReservasAfectadasDialog";
import { mensajeError } from "../../utils/errors";
import Loader from "../../components/Loader";
import DataTable, { type ColumnaDataTable } from "../../components/DataTable";
import ConfirmDialog from "../../components/ConfirmDialog";

export default function FestivosPage() {
  const [festivos, setFestivos] = useState<Festivo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [fecha, setFecha] = useState("");
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorDialog, setErrorDialog] = useState<string | null>(null);

  const [dialogEliminar, setDialogEliminar] = useState<Festivo | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);

  const [aviso, setAviso] = useState<string | null>(null);
  const [afectadas, setAfectadas] = useState<{ festivo: Festivo; reservas: ReservaAdmin[] } | null>(null);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      setFestivos(await listarFestivos());
    } catch (e) {
      setError(mensajeError(e, "No se pudieron cargar los festivos."));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  function abrirCrear() {
    setFecha("");
    setNombre("");
    setDescripcion("");
    setErrorDialog(null);
    setDialogAbierto(true);
  }

  async function guardar() {
    if (!fecha || !nombre.trim()) return;
    setGuardando(true);
    setErrorDialog(null);
    try {
      const creado = await crearFestivo({ fecha, nombre: nombre.trim(), descripcion: descripcion.trim() || undefined });
      setDialogAbierto(false);
      if (creado.reservas_afectadas.length > 0) setAfectadas({ festivo: creado, reservas: creado.reservas_afectadas });
      else setAviso("Festivo registrado. No había reservas ese día.");
      await cargar();
    } catch (e) {
      setErrorDialog(mensajeError(e, "No se pudo crear el festivo."));
    } finally {
      setGuardando(false);
    }
  }

  async function verReservasAfectadas(f: Festivo) {
    setAviso(null);
    try {
      const reservas = await reservasAfectadasFestivo(f.id);
      if (reservas.length === 0) setAviso(f.estado ? "No hay reservas futuras vigentes ese día." : "El festivo está inactivo: no afecta reservas.");
      else setAfectadas({ festivo: f, reservas });
    } catch (e) {
      setError(mensajeError(e, "No se pudieron consultar las reservas."));
    }
  }

  async function alternarEstado(festivo: Festivo) {
    setAviso(null);
    try {
      const r = await actualizarFestivo(festivo.id, { estado: !festivo.estado });
      if (r.reservas_afectadas.length > 0) setAfectadas({ festivo: r, reservas: r.reservas_afectadas });
      await cargar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo cambiar el estado del festivo."));
    }
  }

  async function confirmarEliminar() {
    if (!dialogEliminar) return;
    setEliminando(true);
    setErrorEliminar(null);
    try {
      await eliminarFestivo(dialogEliminar.id);
      setDialogEliminar(null);
      await cargar();
    } catch (e) {
      setErrorEliminar(mensajeError(e, "No se pudo eliminar el festivo."));
    } finally {
      setEliminando(false);
    }
  }

  const columnas: ColumnaDataTable<Festivo>[] = [
    { key: "fecha", label: "Fecha" },
    { key: "nombre", label: "Nombre" },
    { key: "descripcion", label: "Descripción", render: (f) => f.descripcion || "—" },
    {
      key: "estado",
      label: "Estado",
      render: (f) => (
        <Chip size="small" label={f.estado ? "Activo" : "Inactivo"} color={f.estado ? "success" : "default"} />
      ),
    },
    {
      key: "acciones",
      label: "Acciones",
      align: "right",
      render: (f) => (
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button size="small" onClick={() => verReservasAfectadas(f)}>
            Reservas
          </Button>
          <Button size="small" onClick={() => alternarEstado(f)}>
            {f.estado ? "Desactivar" : "Activar"}
          </Button>
          <Button size="small" color="error" onClick={() => setDialogEliminar(f)}>
            Eliminar
          </Button>
        </Stack>
      ),
    },
  ];

  return (
    <Box>
      <PageHeader
        titulo="Festivos"
        descripcion="Días no laborables: no se ofrecen turnos en ninguna agenda. Las reservas que ya existían ese día no se cancelan solas."
        acciones={<Button variant="contained" startIcon={<AddIcon />} onClick={abrirCrear}>Nuevo festivo</Button>}
      />

      {aviso && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setAviso(null)}>{aviso}</Alert>}

      <ReservasAfectadasDialog
        abierto={!!afectadas}
        titulo={`Reservas del ${afectadas?.festivo.fecha ?? ""}`}
        descripcion={`«${afectadas?.festivo.nombre ?? ""}» impide nuevas reservas ese día. Estas reservas ya existían y siguen vigentes: puedes mantenerlas o cancelarlas y avisar a cada colaborador.`}
        reservas={afectadas?.reservas ?? []}
        motivoSugerido={afectadas ? `Día festivo: ${afectadas.festivo.nombre}.` : ""}
        onCerrar={() => setAfectadas(null)}
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {cargando ? (
        <Loader />
      ) : (
        <DataTable
          columnas={columnas}
          filas={festivos}
          obtenerId={(f) => f.id}
          mensajeVacio="No hay festivos registrados."
        />
      )}

      <Dialog open={dialogAbierto} onClose={() => setDialogAbierto(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Nuevo festivo</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {errorDialog && <Alert severity="error">{errorDialog}</Alert>}
            <TextField
              label="Fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} fullWidth />
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
          <Button variant="contained" onClick={guardar} disabled={guardando || !fecha || !nombre.trim()}>
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        abierto={!!dialogEliminar}
        titulo="Eliminar festivo"
        contenido={dialogEliminar && <span>¿Confirmas eliminar el festivo "{dialogEliminar.nombre}"?</span>}
        textoConfirmar="Eliminar"
        colorConfirmar="error"
        cargando={eliminando}
        error={errorEliminar}
        onConfirmar={confirmarEliminar}
        onCancelar={() => setDialogEliminar(null)}
      />
    </Box>
  );
}
