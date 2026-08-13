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
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import type { Agenda, EstadoReserva, Reserva } from "../../types";
import { listarAgendas } from "../../services/agendas";
import { buscarReservas, cancelarReserva, crearReservaManual } from "../../services/reservas";
import { mensajeError } from "../../utils/errors";
import Loader from "../../components/Loader";
import DataTable, { type ColumnaDataTable } from "../../components/DataTable";
import ConfirmDialog from "../../components/ConfirmDialog";

const COLOR_ESTADO: Record<EstadoReserva, "success" | "default" | "info" | "warning"> = {
  activa: "success",
  cancelada: "default",
  completada: "info",
  no_asistio: "warning",
};

const ETIQUETA_ESTADO: Record<EstadoReserva, string> = {
  activa: "Activa",
  cancelada: "Cancelada",
  completada: "Completada",
  no_asistio: "No asistió",
};

export default function ReservasPage() {
  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buscado, setBuscado] = useState(false);

  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [fecha, setFecha] = useState("");
  const [agendaId, setAgendaId] = useState<number | "">("");

  const [dialogCancelar, setDialogCancelar] = useState<Reserva | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [errorCancelar, setErrorCancelar] = useState<string | null>(null);

  const [dialogNueva, setDialogNueva] = useState(false);
  const [nuevaCorreo, setNuevaCorreo] = useState("");
  const [nuevaAgendaId, setNuevaAgendaId] = useState<number | "">("");
  const [nuevaFecha, setNuevaFecha] = useState("");
  const [nuevaHora, setNuevaHora] = useState("");
  const [nuevaNota, setNuevaNota] = useState("");
  const [creando, setCreando] = useState(false);
  const [errorCrear, setErrorCrear] = useState<string | null>(null);

  useEffect(() => {
    listarAgendas()
      .then(setAgendas)
      .catch(() => undefined);
  }, []);

  const nombreAgenda = (id: number) => agendas.find((a) => a.id === id)?.nombre ?? `Agenda #${id}`;

  async function buscar() {
    setCargando(true);
    setError(null);
    setBuscado(true);
    try {
      const params: { nombre?: string; correo?: string; fecha?: string; agenda_id?: number } = {};
      if (nombre.trim()) params.nombre = nombre.trim();
      if (correo.trim()) params.correo = correo.trim();
      if (fecha) params.fecha = fecha;
      if (agendaId !== "") params.agenda_id = Number(agendaId);
      setReservas(await buscarReservas(params));
    } catch (e) {
      setError(mensajeError(e, "No se pudieron buscar las reservas."));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function confirmarCancelar() {
    if (!dialogCancelar) return;
    setCancelando(true);
    setErrorCancelar(null);
    try {
      await cancelarReserva(dialogCancelar.id);
      setDialogCancelar(null);
      await buscar();
    } catch (e) {
      setErrorCancelar(mensajeError(e, "No se pudo cancelar la reserva."));
    } finally {
      setCancelando(false);
    }
  }

  function abrirNueva() {
    setNuevaCorreo("");
    setNuevaAgendaId("");
    setNuevaFecha("");
    setNuevaHora("");
    setNuevaNota("");
    setErrorCrear(null);
    setDialogNueva(true);
  }

  const nuevaValida =
    nuevaCorreo.trim() !== "" && nuevaAgendaId !== "" && nuevaFecha !== "" && nuevaHora !== "";

  async function crearManual() {
    if (!nuevaValida) return;
    setCreando(true);
    setErrorCrear(null);
    try {
      await crearReservaManual({
        correo: nuevaCorreo.trim(),
        agenda_id: Number(nuevaAgendaId),
        fecha: nuevaFecha,
        hora_inicio: nuevaHora,
        notes: nuevaNota.trim() || undefined,
      });
      setDialogNueva(false);
      await buscar();
    } catch (e) {
      setErrorCrear(mensajeError(e, "No se pudo crear la reserva."));
    } finally {
      setCreando(false);
    }
  }

  const columnas: ColumnaDataTable<Reserva>[] = [
    { key: "agenda_id", label: "Agenda", render: (r) => nombreAgenda(r.agenda_id) },
    { key: "fecha", label: "Fecha" },
    { key: "horario", label: "Horario", render: (r) => `${r.hora_inicio?.slice(0, 5)} – ${r.hora_fin?.slice(0, 5)}` },
    {
      key: "estado",
      label: "Estado",
      render: (r) => <Chip size="small" label={ETIQUETA_ESTADO[r.estado]} color={COLOR_ESTADO[r.estado]} />,
    },
    { key: "notes", label: "Notas", render: (r) => r.notes || "—" },
    {
      key: "acciones",
      label: "Acciones",
      align: "right",
      render: (r) =>
        r.estado === "activa" ? (
          <Button size="small" color="error" onClick={() => setDialogCancelar(r)}>
            Cancelar
          </Button>
        ) : null,
    },
  ];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" gap={1}>
        <Typography variant="h4">Reservas</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={abrirNueva}>
          Nueva reserva manual
        </Button>
      </Stack>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={3}>
          <TextField label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} fullWidth size="small" />
        </Grid>
        <Grid item xs={12} sm={3}>
          <TextField label="Correo" value={correo} onChange={(e) => setCorreo(e.target.value)} fullWidth size="small" />
        </Grid>
        <Grid item xs={12} sm={2}>
          <TextField
            label="Fecha"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            fullWidth
            size="small"
            InputLabelProps={{ shrink: true }}
          />
        </Grid>
        <Grid item xs={12} sm={3}>
          <FormControl fullWidth size="small">
            <InputLabel id="reservas-agenda-label">Agenda</InputLabel>
            <Select
              labelId="reservas-agenda-label"
              label="Agenda"
              value={agendaId}
              onChange={(e) => setAgendaId(e.target.value === "" ? "" : Number(e.target.value))}
            >
              <MenuItem value="">Todas las agendas</MenuItem>
              {agendas.map((a) => (
                <MenuItem key={a.id} value={a.id}>
                  {a.nombre}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={1}>
          <Button fullWidth variant="outlined" onClick={buscar} startIcon={<SearchIcon />} sx={{ height: "100%" }}>
            Buscar
          </Button>
        </Grid>
      </Grid>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {cargando ? (
        <Loader />
      ) : (
        <DataTable
          columnas={columnas}
          filas={reservas}
          obtenerId={(r) => r.id}
          mensajeVacio={buscado ? "No se encontraron reservas con esos filtros." : "Sin resultados."}
        />
      )}

      <ConfirmDialog
        abierto={!!dialogCancelar}
        titulo="Cancelar reserva"
        contenido={
          dialogCancelar && (
            <span>
              ¿Confirmas cancelar la reserva del {dialogCancelar.fecha} a las{" "}
              {dialogCancelar.hora_inicio?.slice(0, 5)} en {nombreAgenda(dialogCancelar.agenda_id)}? Esta acción no
              se puede deshacer.
            </span>
          )
        }
        textoConfirmar="Cancelar reserva"
        colorConfirmar="error"
        cargando={cancelando}
        error={errorCancelar}
        onConfirmar={confirmarCancelar}
        onCancelar={() => setDialogCancelar(null)}
      />

      <Dialog open={dialogNueva} onClose={() => setDialogNueva(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Nueva reserva manual</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {errorCrear && <Alert severity="error">{errorCrear}</Alert>}
            <TextField
              label="Correo del colaborador"
              type="email"
              value={nuevaCorreo}
              onChange={(e) => setNuevaCorreo(e.target.value)}
              fullWidth
              autoFocus
            />
            <FormControl fullWidth>
              <InputLabel id="nueva-reserva-agenda-label">Agenda</InputLabel>
              <Select
                labelId="nueva-reserva-agenda-label"
                label="Agenda"
                value={nuevaAgendaId}
                onChange={(e) => setNuevaAgendaId(e.target.value === "" ? "" : Number(e.target.value))}
              >
                {agendas
                  .filter((a) => a.activo)
                  .map((a) => (
                    <MenuItem key={a.id} value={a.id}>
                      {a.nombre}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
            <TextField
              label="Fecha"
              type="date"
              value={nuevaFecha}
              onChange={(e) => setNuevaFecha(e.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Hora de inicio"
              type="time"
              value={nuevaHora}
              onChange={(e) => setNuevaHora(e.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Notas"
              value={nuevaNota}
              onChange={(e) => setNuevaNota(e.target.value)}
              multiline
              minRows={2}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogNueva(false)} disabled={creando}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={crearManual} disabled={creando || !nuevaValida}>
            Crear reserva
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
