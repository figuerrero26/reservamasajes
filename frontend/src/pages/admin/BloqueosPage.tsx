import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
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
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import type { Agenda, Bloqueo, ReservaAdmin, TipoBloqueo } from "../../types";
import { listarAgendas } from "../../services/agendas";
import {
  crearBloqueo, eliminarBloqueo, listarBloqueos, reservasAfectadasBloqueo, type BloqueoPayload,
} from "../../services/bloqueos";
import PageHeader from "../../components/PageHeader";
import ReservasAfectadasDialog from "../../components/ReservasAfectadasDialog";
import { mensajeError } from "../../utils/errors";
import Loader from "../../components/Loader";
import DataTable, { type ColumnaDataTable } from "../../components/DataTable";
import ConfirmDialog from "../../components/ConfirmDialog";

export default function BloqueosPage() {
  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [bloqueos, setBloqueos] = useState<Bloqueo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtroFecha, setFiltroFecha] = useState("");

  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [tipo, setTipo] = useState<TipoBloqueo>("dia");
  const [nuevaAgendaId, setNuevaAgendaId] = useState<number | "">("");
  const [nuevaFecha, setNuevaFecha] = useState("");
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFin, setHoraFin] = useState("");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorDialog, setErrorDialog] = useState<string | null>(null);

  const [dialogEliminar, setDialogEliminar] = useState<Bloqueo | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);

  const [aviso, setAviso] = useState<string | null>(null);
  const [afectadas, setAfectadas] = useState<{ bloqueo: Bloqueo; reservas: ReservaAdmin[] } | null>(null);

  async function verReservasAfectadas(b: Bloqueo) {
    setAviso(null);
    try {
      const reservas = await reservasAfectadasBloqueo(b.id);
      if (reservas.length === 0) setAviso("Este bloqueo no tiene reservas futuras vigentes.");
      else setAfectadas({ bloqueo: b, reservas });
    } catch (e) {
      setError(mensajeError(e, "No se pudieron consultar las reservas."));
    }
  }

  useEffect(() => {
    listarAgendas()
      .then(setAgendas)
      .catch(() => undefined);
  }, []);

  const nombreAgenda = (id?: number | null) =>
    id == null ? "Todas las agendas" : agendas.find((a) => a.id === id)?.nombre ?? `Agenda #${id}`;

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      setBloqueos(await listarBloqueos(filtroFecha || undefined));
    } catch (e) {
      setError(mensajeError(e, "No se pudieron cargar los bloqueos."));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function abrirCrear() {
    setTipo("dia");
    setNuevaAgendaId("");
    setNuevaFecha(filtroFecha || "");
    setHoraInicio("");
    setHoraFin("");
    setMotivo("");
    setErrorDialog(null);
    setDialogAbierto(true);
  }

  const formularioValido =
    nuevaFecha !== "" && (tipo === "dia" || (horaInicio !== "" && horaFin !== ""));

  async function guardar() {
    if (!formularioValido) return;
    setGuardando(true);
    setErrorDialog(null);
    const payload: BloqueoPayload = {
      agenda_id: nuevaAgendaId === "" ? null : Number(nuevaAgendaId),
      tipo,
      fecha: nuevaFecha,
      hora_inicio: tipo === "rango" ? horaInicio : null,
      hora_fin: tipo === "rango" ? horaFin : null,
      motivo: motivo.trim() || undefined,
    };
    try {
      const creado = await crearBloqueo(payload);
      setDialogAbierto(false);
      if (creado.reservas_afectadas.length > 0) {
        setAfectadas({ bloqueo: creado, reservas: creado.reservas_afectadas });
      } else {
        setAviso("Bloqueo creado. No había reservas en ese periodo.");
      }
      await cargar();
    } catch (e) {
      setErrorDialog(mensajeError(e, "No se pudo crear el bloqueo."));
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarEliminar() {
    if (!dialogEliminar) return;
    setEliminando(true);
    setErrorEliminar(null);
    try {
      await eliminarBloqueo(dialogEliminar.id);
      setDialogEliminar(null);
      await cargar();
    } catch (e) {
      setErrorEliminar(mensajeError(e, "No se pudo eliminar el bloqueo."));
    } finally {
      setEliminando(false);
    }
  }

  const columnas: ColumnaDataTable<Bloqueo>[] = [
    { key: "fecha", label: "Fecha" },
    { key: "tipo", label: "Tipo", render: (b) => (b.tipo === "dia" ? "Día completo" : "Rango de horas") },
    { key: "agenda", label: "Agenda", render: (b) => nombreAgenda(b.agenda_id) },
    {
      key: "horario",
      label: "Horario",
      render: (b) => (b.tipo === "rango" ? `${b.hora_inicio?.slice(0, 5)} – ${b.hora_fin?.slice(0, 5)}` : "Todo el día"),
    },
    { key: "motivo", label: "Motivo", render: (b) => b.motivo || "—" },
    {
      key: "acciones",
      label: "Acciones",
      align: "right",
      render: (b) => (
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button size="small" onClick={() => verReservasAfectadas(b)}>
            Reservas
          </Button>
          <Button size="small" color="error" onClick={() => setDialogEliminar(b)}>
            Eliminar
          </Button>
        </Stack>
      ),
    },
  ];

  return (
    <Box>
      <PageHeader
        titulo="Bloqueos"
        descripcion="Días u horas sin atención. Un bloqueo impide nuevas reservas, pero no cancela las existentes: al crearlo verás cuáles quedan dentro para decidir qué hacer."
        acciones={<Button variant="contained" startIcon={<AddIcon />} onClick={abrirCrear}>Nuevo bloqueo</Button>}
      />

      {aviso && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setAviso(null)}>{aviso}</Alert>}

      <ReservasAfectadasDialog
        abierto={!!afectadas}
        titulo="Reservas dentro del bloqueo"
        descripcion={`El bloqueo del ${afectadas?.bloqueo.fecha ?? ""} impide nuevas reservas, pero estas ya existían y siguen vigentes. Puedes mantenerlas o cancelarlas y avisar a cada colaborador.`}
        reservas={afectadas?.reservas ?? []}
        motivoSugerido={afectadas?.bloqueo.motivo || "El servicio no estará disponible en ese horario."}
        onCerrar={() => setAfectadas(null)}
      />

      <Grid container spacing={2} sx={{ mb: 2 }} alignItems="center">
        <Grid item xs={12} sm={4}>
          <TextField
            label="Filtrar por fecha"
            type="date"
            value={filtroFecha}
            onChange={(e) => setFiltroFecha(e.target.value)}
            fullWidth
            size="small"
            InputLabelProps={{ shrink: true }}
          />
        </Grid>
        <Grid item xs={12} sm={3}>
          <Button variant="outlined" startIcon={<SearchIcon />} onClick={cargar}>
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
          filas={bloqueos}
          obtenerId={(b) => b.id}
          mensajeVacio="No hay bloqueos registrados."
        />
      )}

      <Dialog open={dialogAbierto} onClose={() => setDialogAbierto(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Nuevo bloqueo</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {errorDialog && <Alert severity="error">{errorDialog}</Alert>}
            <FormControl fullWidth>
              <InputLabel id="bloqueo-tipo-label">Tipo</InputLabel>
              <Select
                labelId="bloqueo-tipo-label"
                label="Tipo"
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoBloqueo)}
              >
                <MenuItem value="dia">Día completo</MenuItem>
                <MenuItem value="rango">Rango de horas</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel id="bloqueo-agenda-label">Agenda</InputLabel>
              <Select
                labelId="bloqueo-agenda-label"
                label="Agenda"
                value={nuevaAgendaId}
                onChange={(e) => setNuevaAgendaId(e.target.value === "" ? "" : Number(e.target.value))}
              >
                <MenuItem value="">Todas las agendas</MenuItem>
                {agendas.map((a) => (
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
            {tipo === "rango" && (
              <Stack direction="row" spacing={2}>
                <TextField
                  label="Hora inicio"
                  type="time"
                  value={horaInicio}
                  onChange={(e) => setHoraInicio(e.target.value)}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label="Hora fin"
                  type="time"
                  value={horaFin}
                  onChange={(e) => setHoraFin(e.target.value)}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                />
              </Stack>
            )}
            <TextField
              label="Motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
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
          <Button variant="contained" onClick={guardar} disabled={guardando || !formularioValido}>
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        abierto={!!dialogEliminar}
        titulo="Eliminar bloqueo"
        contenido={
          dialogEliminar && (
            <span>
              ¿Confirmas eliminar el bloqueo del {dialogEliminar.fecha} ({nombreAgenda(dialogEliminar.agenda_id)})?
            </span>
          )
        }
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
