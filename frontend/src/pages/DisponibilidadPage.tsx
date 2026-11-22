import { useEffect, useState } from "react";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  Grid, Stack, Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import AgendaCard from "../components/AgendaCard";
import WeekCalendar from "../components/WeekCalendar";
import ReservationDialog from "../components/ReservationDialog";
import type { AgendaPublica, EventoPublico, Slot } from "../types";
import { obtenerEvento } from "../services/eventos";
import { listarAgendasPublicas } from "../services/agendas";
import { obtenerConfiguracion } from "../services/configuracion";
import { mensajeError } from "../utils/errors";
import { diasHabilesSemana, hoyBogota, rangoFechas, sumarDias } from "../utils/fechas";
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

        // Solo días de hoy en adelante: los días ya pasados nunca tienen turnos reservables.
        const hoy = hoyBogota();
        const inicio = config?.semana_activa_inicio;
        const fin = config?.semana_activa_fin;
        if (inicio && fin) {
          setDias(rangoFechas(inicio < hoy ? hoy : inicio, fin));
        } else {
          const estaSemana = diasHabilesSemana(hoy).filter((d) => d >= hoy);
          // Fin de semana sin semana activa configurada: se muestra la semana siguiente.
          setDias(estaSemana.length > 0 ? estaSemana : diasHabilesSemana(sumarDias(hoy, 7)));
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

  function irAIniciarSesion(destino: "/login" | "/registro") {
    if (!agendaSeleccionada || !loginRequerido) return;
    const pendiente: ReservaPendiente = {
      eventoId, agendaId: agendaSeleccionada.id, fecha: loginRequerido.fecha, slot: loginRequerido.slot,
    };
    sessionStorage.setItem(CLAVE_RESERVA_PENDIENTE, JSON.stringify(pendiente));
    navigate(`${destino}?next=/eventos/${eventoId}`);
  }

  if (cargando) return <Loader texto="Cargando horarios…" />;
  if (error || !evento) {
    return (
      <EmptyState
        titulo="Este evento no está disponible"
        descripcion={error ?? undefined}
        accion={<Button component={RouterLink} to="/" variant="contained">Volver al inicio</Button>}
      />
    );
  }

  return (
    <Box>
      <Button component={RouterLink} to="/" startIcon={<ArrowBackIcon />} color="inherit" sx={{ mb: 2, ml: -1 }}>
        Volver
      </Button>

      <Grid container spacing={{ xs: 3, md: 5 }} sx={{ mb: { xs: 3, md: 5 } }} alignItems="center">
        <Grid item xs={12} md={evento.imagen_url ? 7 : 12}>
          <Typography variant="overline" color="text.secondary" component="p">Reserva de turno</Typography>
          <Typography variant="h3" component="h1" sx={{ fontSize: { xs: "2rem", sm: "2.6rem" } }}>
            {evento.nombre}
          </Typography>
          {(evento.descripcion_larga || evento.descripcion_corta) && (
            <Typography variant="body1" color="text.secondary" sx={{ mt: 1.5, maxWidth: 640, whiteSpace: "pre-line" }}>
              {evento.descripcion_larga || evento.descripcion_corta}
            </Typography>
          )}
          <Stack direction="row" spacing={1} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
            <Chip size="small" variant="outlined" label={`Sesiones de ${evento.duracion_minutos} min`} />
            {evento.areas.map((a) => <Chip key={a} size="small" variant="outlined" label={a} />)}
          </Stack>
        </Grid>
        {evento.imagen_url && (
          <Grid item xs={12} md={5}>
            <Box component="img" src={evento.imagen_url} alt="" sx={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: 4 }} />
          </Grid>
        )}
      </Grid>

      {evento.informacion_adicional && (
        <Alert severity="info" sx={{ mb: 3, whiteSpace: "pre-line" }}>{evento.informacion_adicional}</Alert>
      )}

      {agendas.length === 0 && (
        <EmptyState titulo="Sin horarios por ahora" descripcion="Este evento no tiene horarios disponibles en este momento." />
      )}

      {agendas.length > 1 && !agendaSeleccionada && (
        <Box>
          <Typography variant="h6" sx={{ mb: 2 }}>¿Dónde quieres tu sesión?</Typography>
          <Grid container spacing={2}>
            {agendas.map((a) => (
              <Grid item xs={12} sm={6} md={4} key={a.id}>
                <AgendaCard agenda={a} onClick={() => setAgendaSeleccionada(a)} />
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {agendaSeleccionada && dias.length === 0 && (
        <EmptyState
          titulo="No hay fechas abiertas para reservar"
          descripcion="El periodo de reservas configurado ya terminó. Pronto se publicarán nuevas fechas."
        />
      )}

      {agendaSeleccionada && dias.length > 0 && (
        <Box>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" useFlexGap spacing={1}>
            <Box>
              <Typography variant="h6">Elige día y horario</Typography>
              <Typography variant="body2" color="text.secondary">
                {agendas.length > 1 ? `${agendaSeleccionada.area_nombre} · ` : ""}Toca un horario disponible para continuar.
              </Typography>
            </Box>
            {agendas.length > 1 && (
              <Button variant="outlined" size="small" onClick={() => setAgendaSeleccionada(null)}>
                Cambiar área
              </Button>
            )}
          </Stack>
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
          <Button variant="outlined" onClick={() => irAIniciarSesion("/registro")}>
            Crear cuenta
          </Button>
          <Button variant="contained" onClick={() => irAIniciarSesion("/login")}>
            Iniciar sesión
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
