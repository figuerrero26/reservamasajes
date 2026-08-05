import { useEffect, useState } from "react";
import {
  Alert, Box, Button, Card, CardActionArea, CardContent, Snackbar, Step,
  StepLabel, Stepper, TextField, Typography,
} from "@mui/material";
import Loader from "../components/Loader";
import type { AgendaPublica, Slot } from "../types";
import {
  crearReserva, listarAgendasPublicas, obtenerHorarios, validarCedula,
} from "../services/reservas";

const PASOS = ["Cédula", "Actividad", "Fecha", "Horario", "Confirmación"];

export default function ReservaPage() {
  const [paso, setPaso] = useState(0);
  const [cedula, setCedula] = useState("");
  const [agendas, setAgendas] = useState<AgendaPublica[]>([]);
  const [agenda, setAgenda] = useState<AgendaPublica | null>(null);
  const [fecha, setFecha] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    listarAgendasPublicas().then(setAgendas).catch(() => setError("No se pudieron cargar las actividades"));
  }, []);

  const mensajeError = (e: unknown) =>
    (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
    "Ocurrió un error. Intenta de nuevo.";

  async function confirmarCedula() {
    setCargando(true);
    setError(null);
    try {
      const r = await validarCedula(cedula.trim());
      if (!r.valido) {
        setError("La cédula no está registrada. Contacta al administrador.");
        return;
      }
      if (r.tiene_reserva_activa) {
        setError("Ya tienes una reserva activa. Solo se permite una a la vez.");
        return;
      }
      setPaso(1);
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setCargando(false);
    }
  }

  async function cargarHorarios(f: string) {
    if (!agenda || !f) return;
    setCargando(true);
    setError(null);
    try {
      const r = await obtenerHorarios(agenda.id, f);
      setSlots(r.slots);
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setCargando(false);
    }
  }

  async function confirmarReserva() {
    if (!agenda || !slot) return;
    setCargando(true);
    setError(null);
    try {
      await crearReserva({
        cedula: cedula.trim(),
        agenda_id: agenda.id,
        fecha,
        hora_inicio: slot.hora_inicio,
      });
      setOk(true);
      setPaso(0);
      setCedula(""); setAgenda(null); setFecha(""); setSlots([]); setSlot(null);
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setCargando(false);
    }
  }

  return (
    <Box>
      <Stepper activeStep={paso} alternativeLabel sx={{ mb: 4 }}>
        {PASOS.map((p) => (
          <Step key={p}><StepLabel>{p}</StepLabel></Step>
        ))}
      </Stepper>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {cargando && <Loader />}

      {paso === 0 && (
        <Box>
          <Typography variant="h5" gutterBottom>Ingresa tu cédula</Typography>
          <TextField
            fullWidth label="Número de cédula" value={cedula}
            onChange={(e) => setCedula(e.target.value)} sx={{ mb: 2 }}
          />
          <Button variant="contained" disabled={!cedula.trim() || cargando} onClick={confirmarCedula}>
            Continuar
          </Button>
        </Box>
      )}

      {paso === 1 && (
        <Box>
          <Typography variant="h5" gutterBottom>Elige la actividad</Typography>
          {agendas.map((a) => (
            <Card key={a.id} variant="outlined" sx={{ mb: 1.5 }}>
              <CardActionArea onClick={() => { setAgenda(a); setPaso(2); }}>
                <CardContent><Typography>{a.nombre}</Typography></CardContent>
              </CardActionArea>
            </Card>
          ))}
          <Button sx={{ mt: 1 }} onClick={() => setPaso(0)}>Atrás</Button>
        </Box>
      )}

      {paso === 2 && (
        <Box>
          <Typography variant="h5" gutterBottom>Selecciona la fecha</Typography>
          <TextField
            type="date" fullWidth value={fecha}
            onChange={(e) => { setFecha(e.target.value); setSlot(null); cargarHorarios(e.target.value); }}
            InputLabelProps={{ shrink: true }} sx={{ mb: 2 }}
          />
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button onClick={() => setPaso(1)}>Atrás</Button>
            <Button variant="contained" disabled={!fecha || slots.length === 0} onClick={() => setPaso(3)}>
              Ver horarios
            </Button>
          </Box>
          {fecha && slots.length === 0 && !cargando && (
            <Alert severity="info" sx={{ mt: 2 }}>No hay horarios disponibles para esa fecha.</Alert>
          )}
        </Box>
      )}

      {paso === 3 && (
        <Box>
          <Typography variant="h5" gutterBottom>Elige un horario</Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 2 }}>
            {slots.map((s) => (
              <Button
                key={s.hora_inicio}
                variant={slot?.hora_inicio === s.hora_inicio ? "contained" : "outlined"}
                disabled={!s.disponible}
                onClick={() => setSlot(s)}
              >
                {s.hora_inicio.slice(0, 5)}
              </Button>
            ))}
          </Box>
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button onClick={() => setPaso(2)}>Atrás</Button>
            <Button variant="contained" disabled={!slot} onClick={() => setPaso(4)}>Continuar</Button>
          </Box>
        </Box>
      )}

      {paso === 4 && agenda && slot && (
        <Box>
          <Typography variant="h5" gutterBottom>Confirma tu reserva</Typography>
          <Card variant="outlined" sx={{ mb: 2 }}>
            <CardContent>
              <Typography><strong>Actividad:</strong> {agenda.nombre}</Typography>
              <Typography><strong>Fecha:</strong> {fecha}</Typography>
              <Typography><strong>Hora:</strong> {slot.hora_inicio.slice(0, 5)} - {slot.hora_fin.slice(0, 5)}</Typography>
            </CardContent>
          </Card>
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button onClick={() => setPaso(3)}>Atrás</Button>
            <Button variant="contained" disabled={cargando} onClick={confirmarReserva}>
              Confirmar reserva
            </Button>
          </Box>
        </Box>
      )}

      <Snackbar open={ok} autoHideDuration={5000} onClose={() => setOk(false)}>
        <Alert severity="success" onClose={() => setOk(false)}>¡Reserva confirmada!</Alert>
      </Snackbar>
    </Box>
  );
}
