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
  FormControlLabel,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import type { Agenda, AgendaDia, EstadoSlot, Servicio, SlotDia } from "../../types";
import { listarAgendas } from "../../services/agendas";
import { listarServicios } from "../../services/servicios";
import { cancelarReserva, crearReservaManual, marcarAsistencia, obtenerDia } from "../../services/reservas";
import { mensajeError } from "../../utils/errors";
import Loader from "../../components/Loader";
import ConfirmDialog from "../../components/ConfirmDialog";
import { useAuth } from "../../hooks/useAuth";
import { ROL_ADMINISTRADOR } from "../../constants/roles";
import { formatearFechaLarga, hoyBogota } from "../../utils/fechas";
import PageHeader from "../../components/PageHeader";

const ETIQUETA_ESTADO_SLOT: Record<EstadoSlot, string> = {
  disponible: "Disponible",
  ocupado: "Ocupado",
  bloqueado: "Bloqueado",
  pasado: "Pasado",
};

const COLOR_ESTADO_SLOT: Record<EstadoSlot, "success" | "primary" | "warning" | "default" | "error"> = {
  disponible: "success",
  ocupado: "primary",
  bloqueado: "warning",
  pasado: "default",
};

function etiquetaSlot(slot: SlotDia): string {
  if (slot.reserva_estado === "completada") return "Asistió";
  if (slot.reserva_estado === "no_asistio") return "No asistió";
  return ETIQUETA_ESTADO_SLOT[slot.estado];
}

function colorSlot(slot: SlotDia): "success" | "primary" | "warning" | "default" | "error" {
  if (slot.reserva_estado === "completada") return "success";
  if (slot.reserva_estado === "no_asistio") return "error";
  return COLOR_ESTADO_SLOT[slot.estado];
}

// "Hoy" siempre en America/Bogota (antes se usaba la zona del navegador: un administrador en
// otra zona horaria veía por defecto un día distinto al del resto del sistema).
const hoyISO = hoyBogota;
const formatearFecha = formatearFechaLarga;

interface CancelarInfo {
  agenda: AgendaDia;
  slot: SlotDia;
}

export default function ReservasPage() {
  const { rol } = useAuth();
  const puedeGestionar = rol === ROL_ADMINISTRADOR;
  const theme = useTheme();
  const vistaCompacta = useMediaQuery(theme.breakpoints.down("md"));

  const chipsSlot = (slot: SlotDia) => (
    <>
      <Chip
        size="small"
        label={etiquetaSlot(slot)}
        color={colorSlot(slot)}
        variant={slot.estado === "disponible" ? "outlined" : "filled"}
      />
      {slot.estado === "bloqueado" && slot.reserva_id && slot.reserva_estado === "activa" && (
        <Chip size="small" color="warning" variant="outlined" label="Reserva en día bloqueado" />
      )}
      {slot.fuera_de_grilla && <Chip size="small" variant="outlined" label="Fuera del horario actual" />}
    </>
  );

  const accionesSlot = (agenda: AgendaDia, slot: SlotDia, alineacion: "flex-start" | "flex-end") =>
    slot.reserva_id && slot.reserva_estado === "activa" ? (
      <Stack direction="row" spacing={1} justifyContent={alineacion} flexWrap="wrap" useFlexGap sx={{ mt: alineacion === "flex-start" ? 1 : 0 }}>
        {slot.puede_marcar_asistencia && (
          <>
            <Button size="small" color="success" variant={alineacion === "flex-start" ? "outlined" : "text"}
              onClick={() => { setDialogAsistencia({ agenda, slot, asistio: true }); setErrorAsistencia(null); }}>
              Asistió
            </Button>
            <Button size="small" color="warning" variant={alineacion === "flex-start" ? "outlined" : "text"}
              onClick={() => { setDialogAsistencia({ agenda, slot, asistio: false }); setErrorAsistencia(null); }}>
              No asistió
            </Button>
          </>
        )}
        <Button
          size="small"
          color="error"
          variant={alineacion === "flex-start" ? "outlined" : "text"}
          onClick={() => {
            setDialogCancelar({ agenda, slot });
            setErrorCancelar(null);
            setMotivoCancelar("");
            setNotificarCancelar(true);
          }}
        >
          Cancelar
        </Button>
      </Stack>
    ) : null;

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
  const [motivoCancelar, setMotivoCancelar] = useState("");
  const [notificarCancelar, setNotificarCancelar] = useState(true);

  const [dialogAsistencia, setDialogAsistencia] = useState<(CancelarInfo & { asistio: boolean }) | null>(null);
  const [marcando, setMarcando] = useState(false);
  const [errorAsistencia, setErrorAsistencia] = useState<string | null>(null);

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
      await cancelarReserva(dialogCancelar.slot.reserva_id, { motivo: motivoCancelar, notificar: notificarCancelar });
      setDialogCancelar(null);
      await cargar();
    } catch (e) {
      setErrorCancelar(mensajeError(e, "No se pudo cancelar la reserva."));
    } finally {
      setCancelando(false);
    }
  }

  async function confirmarAsistencia() {
    if (!dialogAsistencia?.slot.reserva_id) return;
    setMarcando(true);
    setErrorAsistencia(null);
    try {
      await marcarAsistencia(dialogAsistencia.slot.reserva_id, dialogAsistencia.asistio);
      setDialogAsistencia(null);
      await cargar();
    } catch (e) {
      setErrorAsistencia(mensajeError(e, "No se pudo registrar la asistencia."));
    } finally {
      setMarcando(false);
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
      <PageHeader
        titulo="Reservas"
        descripcion="Todos los turnos del día por agenda: libres, ocupados y bloqueados. Desde aquí se registran asistencias y cancelaciones."
        acciones={puedeGestionar && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={abrirNueva}>
            Nueva reserva manual
          </Button>
        )}
      />

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
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography variant="subtitle1">
                      {agenda.area_nombre} — {agenda.evento_nombre}{" "}
                      <Typography component="span" variant="body2" color="text.secondary">
                        ({agenda.agenda_nombre})
                      </Typography>
                    </Typography>
                    {agenda.agenda_activa === false && (
                      <Chip size="small" variant="outlined" label="No acepta reservas nuevas" />
                    )}
                  </Stack>
                </Box>
                {agenda.slots.length === 0 ? (
                  <Box sx={{ px: 2, py: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin turnos este día.
                    </Typography>
                  </Box>
                ) : vistaCompacta ? (
                  // Móvil y tableta vertical: cada turno en una fila apilada (sin tabla que
                  // obligue a desplazarse de lado).
                  <Box>
                    {agenda.slots.map((slot, i) => (
                      <Box key={`${slot.hora_inicio}-${slot.reserva_id ?? "libre"}`} sx={{ px: 2, py: 1.5, borderTop: i ? 1 : 0, borderColor: "divider" }}>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                          <Typography variant="body2" fontWeight={700}>{slot.hora_inicio.slice(0, 5)} – {slot.hora_fin.slice(0, 5)}</Typography>
                          {chipsSlot(slot)}
                        </Stack>
                        {slot.usuario_nombre && (
                          <Typography variant="body2" sx={{ mt: 0.5, overflowWrap: "anywhere" }}>
                            {slot.usuario_nombre} {slot.usuario_apellido ?? ""}
                            {slot.usuario_correo && (
                              <Typography component="span" variant="body2" color="text.secondary"> · {slot.usuario_correo}</Typography>
                            )}
                          </Typography>
                        )}
                        {slot.notes && <Typography variant="caption" color="text.secondary" display="block">{slot.notes}</Typography>}
                        {puedeGestionar && accionesSlot(agenda, slot, "flex-start")}
                      </Box>
                    ))}
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
                          <TableRow key={`${slot.hora_inicio}-${slot.reserva_id ?? "libre"}`} hover>
                            <TableCell>{slot.hora_inicio.slice(0, 5)} – {slot.hora_fin.slice(0, 5)}</TableCell>
                            <TableCell>
                              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>{chipsSlot(slot)}</Stack>
                            </TableCell>
                            <TableCell>
                              {slot.usuario_nombre ? `${slot.usuario_nombre} ${slot.usuario_apellido ?? ""}` : "—"}
                            </TableCell>
                            <TableCell>{slot.usuario_correo || "—"}</TableCell>
                            <TableCell>{slot.notes || "—"}</TableCell>
                            {puedeGestionar && <TableCell align="right">{accionesSlot(agenda, slot, "flex-end")}</TableCell>}
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
            <Stack spacing={2}>
              <span>
                ¿Confirmas cancelar la reserva de {dialogCancelar.slot.usuario_nombre} {dialogCancelar.slot.usuario_apellido} el{" "}
                {formatearFecha(fecha)} a las {dialogCancelar.slot.hora_inicio.slice(0, 5)} en {dialogCancelar.agenda.evento_nombre}?
                El horario quedará libre. Esta acción no se puede deshacer.
              </span>
              <TextField
                label="Motivo (opcional, se incluye en el correo)"
                size="small"
                value={motivoCancelar}
                onChange={(e) => setMotivoCancelar(e.target.value)}
                inputProps={{ maxLength: 500 }}
                fullWidth
              />
              <FormControlLabel
                control={<Switch checked={notificarCancelar} onChange={(e) => setNotificarCancelar(e.target.checked)} />}
                label="Avisar al colaborador por correo"
              />
            </Stack>
          )
        }
        textoConfirmar="Cancelar reserva"
        colorConfirmar="error"
        cargando={cancelando}
        error={errorCancelar}
        onConfirmar={confirmarCancelar}
        onCancelar={() => setDialogCancelar(null)}
      />

      <ConfirmDialog
        abierto={!!dialogAsistencia}
        titulo={dialogAsistencia?.asistio ? "Marcar asistencia" : "Marcar inasistencia"}
        contenido={
          dialogAsistencia && (
            <span>
              ¿Confirmas que {dialogAsistencia.slot.usuario_nombre} {dialogAsistencia.slot.usuario_apellido}{" "}
              {dialogAsistencia.asistio ? "sí asistió" : "no asistió"} el {fecha} a las{" "}
              {dialogAsistencia.slot.hora_inicio.slice(0, 5)} en {dialogAsistencia.agenda.evento_nombre}?
              Esta acción no se puede deshacer.
            </span>
          )
        }
        textoConfirmar={dialogAsistencia?.asistio ? "Sí asistió" : "No asistió"}
        colorConfirmar={dialogAsistencia?.asistio ? "success" : "warning"}
        cargando={marcando}
        error={errorAsistencia}
        onConfirmar={confirmarAsistencia}
        onCancelar={() => setDialogAsistencia(null)}
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
