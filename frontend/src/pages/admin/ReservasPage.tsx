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
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import type { Agenda, AgendaDia, EstadoSlot, Servicio, SlotDia } from "../../types";
import { listarAgendas } from "../../services/agendas";
import { listarServicios } from "../../services/servicios";
import { cancelarReserva, crearReservaManual, obtenerDia } from "../../services/reservas";
import { mensajeError } from "../../utils/errors";
import Loader from "../../components/Loader";
import ConfirmDialog from "../../components/ConfirmDialog";
import { useAuth } from "../../hooks/useAuth";
import { ROL_ADMINISTRADOR } from "../../constants/roles";

const ETIQUETA_ESTADO_SLOT: Record<EstadoSlot, string> = {
  disponible: "Disponible",
  ocupado: "Ocupado",
  bloqueado: "Bloqueado",
  pasado: "Pasado",
};

const COLOR_ESTADO_SLOT: Record<EstadoSlot, "success" | "primary" | "warning" | "default"> = {
  disponible: "success",
  ocupado: "primary",
  bloqueado: "warning",
  pasado: "default",
};

function hoyISO() {
  const hoy = new Date();
  const mes = String(hoy.getMonth() + 1).padStart(2, "0");
  const dia = String(hoy.getDate()).padStart(2, "0");
  return `${hoy.getFullYear()}-${mes}-${dia}`;
}

function formatearFecha(fecha: string) {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  return new Date(anio, mes - 1, dia).toLocaleDateString("es-CO", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

interface CancelarInfo {
  agenda: AgendaDia;
  slot: SlotDia;
}

export default function ReservasPage() {
  const { rol } = useAuth();
  const puedeGestionar = rol === ROL_ADMINISTRADOR;

  const [fecha, setFecha] = useState(hoyISO());
  const [servicioId, setServicioId] = useState<number | "">("");
  const [agendasDia, setAgendasDia] = useState<AgendaDia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);

  const [dialogCancelar, setDialogCancelar] = useState<CancelarInfo | null>(null);
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
    listarServicios()
      .then(setServicios)
      .catch(() => undefined);
  }, []);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      setAgendasDia(await obtenerDia(fecha, servicioId === "" ? undefined : servicioId));
    } catch (e) {
      setError(mensajeError(e, "No se pudo cargar el día."));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha, servicioId]);

  async function confirmarCancelar() {
    if (!dialogCancelar?.slot.reserva_id) return;
    setCancelando(true);
    setErrorCancelar(null);
    try {
      await cancelarReserva(dialogCancelar.slot.reserva_id);
      setDialogCancelar(null);
      await cargar();
    } catch (e) {
      setErrorCancelar(mensajeError(e, "No se pudo cancelar la reserva."));
    } finally {
      setCancelando(false);
    }
  }

  function abrirNueva() {
    setNuevaCorreo("");
    setNuevaAgendaId("");
    setNuevaFecha(fecha);
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
      await cargar();
    } catch (e) {
      setErrorCrear(mensajeError(e, "No se pudo crear la reserva."));
    } finally {
      setCreando(false);
    }
  }

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" gap={1}>
        <Typography variant="h4">Reservas</Typography>
        {puedeGestionar && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={abrirNueva}>
            Nueva reserva manual
          </Button>
        )}
      </Stack>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={3}>
          <TextField
            label="Día"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            fullWidth
            size="small"
            InputLabelProps={{ shrink: true }}
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <FormControl fullWidth size="small">
            <InputLabel id="reservas-dia-evento-label">Evento</InputLabel>
            <Select
              labelId="reservas-dia-evento-label"
              label="Evento"
              value={servicioId}
              onChange={(e) => setServicioId(e.target.value === "" ? "" : Number(e.target.value))}
            >
              <MenuItem value="">Todos los eventos</MenuItem>
              {servicios.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.nombre}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
      </Grid>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {cargando ? (
        <Loader />
      ) : agendasDia.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No hay agendas activas.
        </Typography>
      ) : (
        <>
          <Typography variant="h6" sx={{ mb: 2, textTransform: "capitalize" }}>
            {formatearFecha(fecha)}
          </Typography>
          <Stack spacing={2}>
            {agendasDia.map((agenda) => (
              <Paper key={agenda.agenda_id} variant="outlined">
                <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: "divider" }}>
                  <Typography variant="subtitle1">
                    {agenda.area_nombre} — {agenda.evento_nombre}{" "}
                    <Typography component="span" variant="body2" color="text.secondary">
                      ({agenda.agenda_nombre})
                    </Typography>
                  </Typography>
                </Box>
                {agenda.slots.length === 0 ? (
                  <Box sx={{ px: 2, py: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin turnos este día.
                    </Typography>
                  </Box>
                ) : (
                  <TableContainer sx={{ overflowX: "auto" }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Hora</TableCell>
                          <TableCell>Estado</TableCell>
                          <TableCell>Colaborador</TableCell>
                          <TableCell>Correo</TableCell>
                          <TableCell>Notas</TableCell>
                          {puedeGestionar && <TableCell align="right">Acciones</TableCell>}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {agenda.slots.map((slot) => (
                          <TableRow key={slot.hora_inicio} hover>
                            <TableCell>{slot.hora_inicio.slice(0, 5)} – {slot.hora_fin.slice(0, 5)}</TableCell>
                            <TableCell>
                              <Chip
                                size="small"
                                label={ETIQUETA_ESTADO_SLOT[slot.estado]}
                                color={COLOR_ESTADO_SLOT[slot.estado]}
                                variant={slot.estado === "disponible" ? "outlined" : "filled"}
                              />
                            </TableCell>
                            <TableCell>
                              {slot.usuario_nombre ? `${slot.usuario_nombre} ${slot.usuario_apellido ?? ""}` : "—"}
                            </TableCell>
                            <TableCell>{slot.usuario_correo || "—"}</TableCell>
                            <TableCell>{slot.notes || "—"}</TableCell>
                            {puedeGestionar && (
                              <TableCell align="right">
                                {slot.estado === "ocupado" && slot.reserva_id && (
                                  <Button
                                    size="small"
                                    color="error"
                                    onClick={() => { setDialogCancelar({ agenda, slot }); setErrorCancelar(null); }}
                                  >
                                    Cancelar
                                  </Button>
                                )}
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Paper>
            ))}
          </Stack>
        </>
      )}

      <ConfirmDialog
        abierto={!!dialogCancelar}
        titulo="Cancelar reserva"
        contenido={
          dialogCancelar && (
            <span>
              ¿Confirmas cancelar la reserva de {dialogCancelar.slot.usuario_nombre} {dialogCancelar.slot.usuario_apellido} el{" "}
              {fecha} a las {dialogCancelar.slot.hora_inicio.slice(0, 5)} en {dialogCancelar.agenda.evento_nombre}?
              Esta acción no se puede deshacer.
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
