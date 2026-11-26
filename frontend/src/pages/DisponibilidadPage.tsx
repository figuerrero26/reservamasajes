import { useEffect, useState } from "react";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  Grid, Stack, Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import EventOutlinedIcon from "@mui/icons-material/EventOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import Loader from "../components/Loader";
import { PortadaEvento } from "../components/EventCard";
import EmptyState from "../components/EmptyState";
import AgendaCard, { nombrePropioAgenda } from "../components/AgendaCard";
import DetalleEvento from "../components/DetalleEvento";
import WeekCalendar from "../components/WeekCalendar";
import ReservationDialog from "../components/ReservationDialog";
import type { AgendaPublica, EventoPublico, Slot } from "../types";
import { obtenerEvento } from "../services/eventos";
import { listarAgendasPublicas } from "../services/agendas";
import { mensajeError } from "../utils/errors";
import { programarActualizacion, textoFechasLargas } from "../utils/fechas";
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

    let vigente = true;
    let temporizador: number | undefined;

    async function cargar() {
      try {
        const [eventoData, agendasData] = await Promise.all([obtenerEvento(eventoId), listarAgendasPublicas(eventoId)]);
        if (!vigente) return;
        setError(null);
        setEvento(eventoData);
        window.clearTimeout(temporizador);
        temporizador = programarActualizacion(eventoData.proximo_cambio_en, () => { void cargar(); });
        setAgendas(agendasData);
        setAgendaSeleccionada((actual) => agendasData.length === 1
          ? agendasData[0]
          : agendasData.find((agenda) => agenda.id === actual?.id) ?? null);
        setDias((actuales) => {
          const nuevas = eventoData.dias_reservables ?? [];
          return actuales.length === nuevas.length && actuales.every((dia, i) => dia === nuevas[i]) ? actuales : nuevas;
        });
        if (eventoData.motivo_no_disponible) {
          setSeleccion(null);
          setLoginRequerido(null);
        }
      } catch (e) {
        if (vigente) setError(mensajeError(e, "No se pudo cargar el evento."));
      } finally {
        if (vigente) setCargando(false);
      }
    }

    void cargar();
    const intervalo = window.setInterval(() => {
      if (!document.hidden) void cargar();
    }, 10000);
    return () => {
      vigente = false;
      window.clearInterval(intervalo);
      window.clearTimeout(temporizador);
    };
  }, [eventoId]);

  // Restaura la selección guardada antes de mandar al colaborador a iniciar sesión.
  useEffect(() => {
    if (!token || agendas.length === 0 || evento?.motivo_no_disponible) return;
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
  }, [token, agendas, eventoId, evento?.motivo_no_disponible]);

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

  // Información del lugar: el área (con su descripción, si hay un solo lugar) y, cuando la
  // agenda tiene un nombre propio, el espacio o profesional que atiende.
  const lugar = agendas.length === 0 ? (evento?.areas.join(" · ") || null)
    : agendas.length === 1 ? (
      <>
        {agendas[0].area_nombre}
        {nombrePropioAgenda(agendas[0]) ? ` · ${nombrePropioAgenda(agendas[0])}` : ""}
        {agendas[0].area_descripcion && (
          <Typography variant="body2" color="text.secondary" component="span" sx={{ display: "block" }}>
            {agendas[0].area_descripcion}
          </Typography>
        )}
      </>
    ) : `${agendas.map((a) => a.area_nombre).join(" · ")} (eliges el lugar al reservar)`;
  const duracion = !evento ? null : evento.duracion_minutos === evento.duracion_maxima
    ? `${evento.duracion_minutos} minutos`
    : `Entre ${evento.duracion_minutos} y ${evento.duracion_maxima} minutos, según el lugar`;

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

      <Grid container spacing={{ xs: 3, md: 5 }} sx={{ mb: { xs: 3, md: 4 } }} alignItems="center">
        <Grid item xs={12} md={evento.imagen_url ? 7 : 12}>
          <Typography variant="overline" color="text.secondary" component="p">Evento de reserva</Typography>
          <Typography variant="h3" component="h1" sx={{ fontSize: { xs: "2rem", sm: "2.6rem" }, wordBreak: "break-word" }}>
            {evento.nombre}
          </Typography>
          {(evento.descripcion_larga || evento.descripcion_corta) && (
            <Typography variant="body1" color="text.secondary" sx={{ mt: 1.5, maxWidth: 640, whiteSpace: "pre-line" }}>
              {evento.descripcion_larga || evento.descripcion_corta}
            </Typography>
          )}
        </Grid>
        {evento.imagen_url && (
          <Grid item xs={12} md={5}>
            <PortadaEvento imagenUrl={evento.imagen_url} proporcion="4 / 3" radio={4} />
          </Grid>
        )}
      </Grid>

      {/* Solo lo que corresponde a un evento de reserva: dónde, cuándo y cuánto dura cada
          sesión. */}
      <Grid container spacing={2} sx={{ mb: { xs: 4, md: 5 } }}>
        <Grid item xs={12} md={7}>
          <DetalleEvento
            filas={[
              { icono: <PlaceOutlinedIcon />, titulo: agendas.length > 1 ? "Lugares" : "Lugar", contenido: lugar },
              { icono: <EventOutlinedIcon />, titulo: "Fechas", contenido: textoFechasLargas(evento.vigencia_inicio, evento.vigencia_fin) },
              { icono: <ScheduleOutlinedIcon />, titulo: "Duración de cada sesión", contenido: duracion },
            ]}
          />
        </Grid>
      </Grid>

      {evento.motivo_no_disponible && (
        <Alert severity="info" sx={{ mb: 3 }}>{evento.motivo_no_disponible}</Alert>
      )}

      {agendas.length > 0 && evento.turnos_disponibles === 0 && (
        <Alert severity="info" sx={{ mb: 3 }}>
          Por ahora todos los turnos de estas fechas están ocupados. Si alguien cancela, el turno vuelve a quedar disponible.
        </Alert>
      )}

      {agendas.length === 0 && (
        <EmptyState titulo="Sin horarios por ahora" descripcion="Este evento no tiene horarios disponibles en este momento." />
      )}

      {!evento.motivo_no_disponible && agendas.length > 1 && !agendaSeleccionada && (
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

      {!evento.motivo_no_disponible && agendaSeleccionada && dias.length === 0 && (
        <EmptyState
          titulo="No hay fechas abiertas para reservar"
          descripcion="Este evento ya no tiene días disponibles dentro de su vigencia."
        />
      )}

      {!evento.motivo_no_disponible && agendaSeleccionada && dias.length > 0 && (
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

      {!evento.motivo_no_disponible && agendaSeleccionada && seleccion && (
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
