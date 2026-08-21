import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  Grid, Typography,
} from "@mui/material";
import Loader from "../components/Loader";
import AgendaCard from "../components/AgendaCard";
import WeekCalendar from "../components/WeekCalendar";
import ReservationDialog from "../components/ReservationDialog";
import type { AgendaPublica, EventoPublico, Slot } from "../types";
import { obtenerEvento } from "../services/eventos";
import { listarAgendasPublicas } from "../services/agendas";
import { obtenerConfiguracion } from "../services/configuracion";
import { mensajeError } from "../utils/errors";
import { diasHabilesSemana, hoyBogota, rangoFechas } from "../utils/fechas";
import { useUsuarioAuth } from "../hooks/useUsuarioAuth";

const CLAVE_RESERVA_PENDIENTE = "reserva_pendiente";

interface ReservaPendiente {
  eventoId: number;
  agendaId: number;
  fecha: string;
  slot: Slot;
}

export default function DisponibilidadPage() {
  const { id } = useParams<{ id: string }>();
  const eventoId = Number(id);
  const navigate = useNavigate();
  const { token } = useUsuarioAuth();

  const [evento, setEvento] = useState<EventoPublico | null>(null);
  const [agendas, setAgendas] = useState<AgendaPublica[]>([]);
  const [agendaSeleccionada, setAgendaSeleccionada] = useState<AgendaPublica | null>(null);
  const [dias, setDias] = useState<string[]>([]);
  const [seleccion, setSeleccion] = useState<{ fecha: string; slot: Slot } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loginRequerido, setLoginRequerido] = useState<{ fecha: string; slot: Slot } | null>(null);

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCargando(true);
    setError(null);
    setEvento(null);
    setAgendas([]);
    setAgendaSeleccionada(null);
    setSeleccion(null);

    Promise.all([
      obtenerEvento(eventoId),
      listarAgendasPublicas(eventoId),
      obtenerConfiguracion().catch(() => null),
    ])
      .then(([eventoData, agendasData, config]) => {
        setEvento(eventoData);
        setAgendas(agendasData);
        if (agendasData.length === 1) setAgendaSeleccionada(agendasData[0]);

        const hoy = hoyBogota();
        const inicio = config?.semana_activa_inicio;
        const fin = config?.semana_activa_fin;
        if (inicio && fin) {
          setDias(rangoFechas(inicio, fin));
        } else {
          setDias(diasHabilesSemana(hoy));
        }
      })
      .catch((e) => setError(mensajeError(e, "No se pudo cargar el evento.")))
      .finally(() => setCargando(false));
  }, [eventoId]);

  // Restaura la selección guardada antes de mandar al colaborador a iniciar sesión.
  useEffect(() => {
    if (!token || agendas.length === 0) return;
    const raw = sessionStorage.getItem(CLAVE_RESERVA_PENDIENTE);
    if (!raw) return;
    try {
      const pendiente = JSON.parse(raw) as ReservaPendiente;
      if (pendiente.eventoId !== eventoId) return;
      const agendaEncontrada = agendas.find((a) => a.id === pendiente.agendaId);
      if (!agendaEncontrada) return;
      setAgendaSeleccionada(agendaEncontrada);
      setSeleccion({ fecha: pendiente.fecha, slot: pendiente.slot });
    } catch {
      // JSON inválido: se descarta abajo de todas formas.
    } finally {
      sessionStorage.removeItem(CLAVE_RESERVA_PENDIENTE);
    }
  }, [token, agendas, eventoId]);

  function manejarSeleccionSlot(fecha: string, slot: Slot) {
    if (!agendaSeleccionada) return;
    if (token) {
      setSeleccion({ fecha, slot });
      return;
    }
    setLoginRequerido({ fecha, slot });
  }

  function irAIniciarSesion() {
    if (!agendaSeleccionada || !loginRequerido) return;
    const pendiente: ReservaPendiente = {
      eventoId, agendaId: agendaSeleccionada.id, fecha: loginRequerido.fecha, slot: loginRequerido.slot,
    };
    sessionStorage.setItem(CLAVE_RESERVA_PENDIENTE, JSON.stringify(pendiente));
    navigate(`/login?next=/eventos/${eventoId}`);
  }

  if (cargando) return <Loader />;
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!evento) return null;

  return (
    <Box>
      <Typography variant="h4" gutterBottom>{evento.nombre}</Typography>
      {evento.descripcion_larga && (
        <Typography variant="body1" color="text.secondary" sx={{ mb: 1 }}>
          {evento.descripcion_larga}
        </Typography>
      )}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Duración: {evento.duracion_minutos} min
      </Typography>
      {evento.informacion_adicional && (
        <Alert severity="info" sx={{ mb: 2 }}>{evento.informacion_adicional}</Alert>
      )}

      {agendas.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Este evento no tiene horarios disponibles por ahora.
        </Typography>
      )}

      {agendas.length > 1 && !agendaSeleccionada && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="h6" gutterBottom>Elige el área</Typography>
          <Grid container spacing={2}>
            {agendas.map((a) => (
              <Grid item xs={12} sm={6} md={4} key={a.id}>
                <AgendaCard agenda={a} onClick={() => setAgendaSeleccionada(a)} />
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {agendaSeleccionada && dias.length > 0 && (
        <Box sx={{ mt: 3 }}>
          {agendas.length > 1 && (
            <Button sx={{ mb: 2 }} onClick={() => setAgendaSeleccionada(null)}>
              Cambiar área
            </Button>
          )}
          <Typography variant="h6" gutterBottom>Elige día y horario</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Toca un horario disponible para continuar.
          </Typography>
          <WeekCalendar
            key={`${agendaSeleccionada.id}-${refreshKey}`}
            agendaId={agendaSeleccionada.id}
            dias={dias}
            slotSeleccionado={seleccion}
            onSeleccionarSlot={manejarSeleccionSlot}
          />
        </Box>
      )}

      {agendaSeleccionada && seleccion && (
        <ReservationDialog
          open
          agenda={agendaSeleccionada}
          fecha={seleccion.fecha}
          slot={seleccion.slot}
          onClose={() => setSeleccion(null)}
          onConflicto={() => setRefreshKey((k) => k + 1)}
          onReservada={() => setRefreshKey((k) => k + 1)}
        />
      )}

      <Dialog open={!!loginRequerido} onClose={() => setLoginRequerido(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Inicia sesión para agendar</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Para apartar el horario de las {loginRequerido?.slot.hora_inicio.slice(0, 5)} necesitas
            iniciar sesión primero (o registrarte si aún no tienes cuenta). No te preocupes, guardamos
            tu selección y podrás continuar apenas ingreses.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLoginRequerido(null)}>Cancelar</Button>
          <Button variant="contained" onClick={irAIniciarSesion}>
            Iniciar sesión
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
