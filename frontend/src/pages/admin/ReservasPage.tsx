import { useEffect, useMemo, useState } from "react";
import {
  Alert, Box, Button, Card, CardActionArea, CardContent, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControl, Grid, InputLabel, MenuItem, Paper, Select, Stack, TextField, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import EventAvailableOutlinedIcon from "@mui/icons-material/EventAvailableOutlined";
import HowToRegOutlinedIcon from "@mui/icons-material/HowToRegOutlined";
import type { Actividad, Agenda, Area, EstadoVigencia, Servicio, Sesion } from "../../types";
import { listarAgendas } from "../../services/agendas";
import { listarAreas } from "../../services/areas";
import { listarServicios } from "../../services/servicios";
import { crearReservaManual } from "../../services/reservas";
import { listarActividades, listarSesiones } from "../../services/actividades";
import { crearInscripcionManual } from "../../services/inscripciones";
import { mensajeError } from "../../utils/errors";
import { formatearHora, hoyBogota, resumenDiasSemana, textoVigencia } from "../../utils/fechas";
import { useAuth } from "../../hooks/useAuth";
import { ROL_ADMINISTRADOR } from "../../constants/roles";
import PageHeader from "../../components/PageHeader";
import Loader from "../../components/Loader";
import EmptyState from "../../components/EmptyState";
import HistorialReservasPanel from "../../components/admin/HistorialReservasPanel";
import HistorialInscripcionesPanel from "../../components/admin/HistorialInscripcionesPanel";

type Seleccion = { tipo: "reserva"; id: number } | { tipo: "inscripcion"; id: number };
type Evento = { tipo: "reserva" | "inscripcion"; servicio?: Servicio; actividad?: Actividad; agendas: Agenda[] };

const VIGENCIA: Record<EstadoVigencia, { texto: string; color: "success" | "info" | "default" | "warning" }> = {
  vigente: { texto: "Vigente", color: "success" },
  proximo: { texto: "Próximo", color: "info" },
  finalizado: { texto: "Finalizado", color: "default" },
  sin_vigencia: { texto: "Sin vigencia", color: "warning" },
};

/** Fecha representativa de un evento, para ordenar el historial cronológicamente: la próxima
 * sesión si la hay (actividades), si no el fin o el inicio de su vigencia. */
function fechaOrden(ev: Evento): string {
  return ev.actividad?.resumen.proxima_fecha || ev.servicio?.vigencia_fin || ev.servicio?.vigencia_inicio
    || ev.actividad?.vigencia_fin || ev.actividad?.vigencia_inicio || "0000-01-01";
}

/** Áreas de un evento: para una actividad, la suya (única); para un servicio, las de sus
 * agendas activas (puede tener más de una, p. ej. Oficinas y Planta). */
function areasDe(ev: Evento, nombreArea: (id: number) => string): string[] {
  if (ev.actividad) return ev.actividad.area_nombre ? [ev.actividad.area_nombre] : [];
  return Array.from(new Set(ev.agendas.filter((a) => a.activo).map((a) => nombreArea(a.area_id))));
}

/** Fecha/horario de un evento en una línea: próxima sesión para actividades, horario de
 * agenda(s) para servicios. */
function fechaHoraDe(ev: Evento): string {
  if (ev.actividad) {
    const r = ev.actividad.resumen;
    return r.proxima_fecha
      ? `${r.proxima_fecha} · ${formatearHora(r.proxima_hora_inicio!)}–${formatearHora(r.proxima_hora_fin!)}`
      : textoVigencia(ev.actividad.vigencia_inicio, ev.actividad.vigencia_fin) ?? "Sin fechas programadas";
  }
  const activas = ev.agendas.filter((a) => a.activo);
  if (activas.length === 1) return `${resumenDiasSemana(activas[0].dias_habilitados)} · ${formatearHora(activas[0].hora_inicio)}–${formatearHora(activas[0].hora_fin)}`;
  if (activas.length > 1) return `${activas.length} agendas activas`;
  return "Sin agendas activas";
}

function cuposDe(ev: Evento): string | null {
  if (!ev.actividad) return null;
  const r = ev.actividad.resumen;
  return r.cupos_disponibles != null ? `${r.cupos_disponibles} cupo(s) disponible(s)` : "Sin límite de cupo";
}

/** Tarjeta de un evento en el listado: nombre, tipo, área, fecha/horario, cupos (si aplica)
 * y estado de vigencia — para elegir cuál consultar. */
function TarjetaEvento({ ev, nombreArea, onClick }: { ev: Evento; nombreArea: (id: number) => string; onClick: () => void }) {
  const estado = (ev.servicio ?? ev.actividad)!.estado_vigencia;
  const { texto, color } = VIGENCIA[estado];
  const nombre = (ev.servicio ?? ev.actividad)!.nombre;
  const areas = areasDe(ev, nombreArea);
  const cupos = cuposDe(ev);

  return (
    <Grid item xs={12} sm={6} md={4}>
      <Card variant="outlined" sx={{ height: "100%" }}>
        <CardActionArea onClick={onClick} sx={{ height: "100%", p: 0.5 }}>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1} sx={{ mb: 1 }}>
              <Chip
                size="small"
                icon={ev.tipo === "reserva" ? <EventAvailableOutlinedIcon /> : <HowToRegOutlinedIcon />}
                label={ev.tipo === "reserva" ? "Reserva" : "Inscripción"}
                variant="outlined"
              />
              <Chip size="small" label={texto} color={color} variant={color === "default" ? "outlined" : "filled"} />
            </Stack>
            <Typography variant="subtitle1" fontWeight={600} sx={{ wordBreak: "break-word" }}>{nombre}</Typography>
            {areas.length > 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{areas.join(" · ")}</Typography>
            )}
            <Typography variant="body2" color="text.secondary">{fechaHoraDe(ev)}</Typography>
            {cupos && <Typography variant="body2" color="text.secondary">{cupos}</Typography>}
          </CardContent>
        </CardActionArea>
      </Card>
    </Grid>
  );
}

/** Ficha fija del evento que se está consultando: queda visible mientras se revisan sus
 * reservas o inscripciones, para no perder de vista cuál es. */
function FichaEvento({ ev, nombreArea }: { ev: Evento; nombreArea: (id: number) => string }) {
  const estado = (ev.servicio ?? ev.actividad)!.estado_vigencia;
  const { texto, color } = VIGENCIA[estado];
  const nombre = (ev.servicio ?? ev.actividad)!.nombre;
  const areas = areasDe(ev, nombreArea);
  const cupos = cuposDe(ev);

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }} spacing={1}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }}>
            <Chip
              size="small"
              icon={ev.tipo === "reserva" ? <EventAvailableOutlinedIcon /> : <HowToRegOutlinedIcon />}
              label={ev.tipo === "reserva" ? "Reserva" : "Inscripción"}
              variant="outlined"
            />
            <Chip size="small" label={texto} color={color} variant={color === "default" ? "outlined" : "filled"} />
          </Stack>
          <Typography variant="h6" sx={{ wordBreak: "break-word" }}>{nombre}</Typography>
          <Typography variant="body2" color="text.secondary">
            {areas.length > 0 ? areas.join(" · ") + " · " : ""}{fechaHoraDe(ev)}{cupos ? ` · ${cupos}` : ""}
          </Typography>
        </Box>
      </Stack>
    </Paper>
  );
}

export default function ReservasPage() {
  const { rol } = useAuth();
  const puedeGestionar = rol === ROL_ADMINISTRADOR;

  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [seleccion, setSeleccion] = useState<Seleccion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refrescarEn, setRefrescarEn] = useState(0);

  // Diálogo "nueva reserva manual" (eventos de reserva)
  const [dialogNuevaReserva, setDialogNuevaReserva] = useState(false);
  const [nuevaCorreo, setNuevaCorreo] = useState("");
  const [nuevaAgendaId, setNuevaAgendaId] = useState<number | "">("");
  const [nuevaFecha, setNuevaFecha] = useState("");
  const [nuevaHora, setNuevaHora] = useState("");
  const [nuevaNota, setNuevaNota] = useState("");
  const [creando, setCreando] = useState(false);
  const [errorCrear, setErrorCrear] = useState<string | null>(null);

  // Diálogo "nueva inscripción manual" (eventos de inscripción)
  const [dialogNuevaInscripcion, setDialogNuevaInscripcion] = useState(false);
  const [sesionesActividad, setSesionesActividad] = useState<Sesion[]>([]);
  const [cargandoSesiones, setCargandoSesiones] = useState(false);
  const [nuevaCorreoInsc, setNuevaCorreoInsc] = useState("");
  const [nuevaSesionId, setNuevaSesionId] = useState<number | "">("");
  const [nuevaNotaInsc, setNuevaNotaInsc] = useState("");
  const [creandoInsc, setCreandoInsc] = useState(false);
  const [errorCrearInsc, setErrorCrearInsc] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listarServicios(), listarActividades(), listarAgendas(), listarAreas()])
      .then(([sv, ac, ag, ar]) => {
        setServicios(sv);
        setActividades(ac);
        setAgendas(ag);
        setAreas(ar);
      })
      .catch((e) => setError(mensajeError(e, "No se pudieron cargar los eventos.")))
      .finally(() => setCargando(false));
  }, []);

  const nombreArea = (id: number) => areas.find((a) => a.id === id)?.nombre ?? "—";

  const servicioSeleccionado = seleccion?.tipo === "reserva" ? servicios.find((s) => s.id === seleccion.id) ?? null : null;
  const actividadSeleccionada = seleccion?.tipo === "inscripcion" ? actividades.find((a) => a.id === seleccion.id) ?? null : null;
  const agendasDelEvento = agendas.filter((a) => a.servicio_id === servicioSeleccionado?.id && a.activo);

  // Listado combinado de eventos, ordenado cronológicamente (próxima fecha o fin de vigencia
  // primero), sin excluir finalizados: el mismo listado para administrador y para el rol de
  // solo consulta.
  const eventosOrdenados = useMemo((): Evento[] => {
    const todos: Evento[] = [
      ...servicios.map((s) => ({ tipo: "reserva" as const, servicio: s, actividad: undefined, agendas: agendas.filter((a) => a.servicio_id === s.id) })),
      ...actividades.map((a) => ({ tipo: "inscripcion" as const, servicio: undefined, actividad: a, agendas: [] as Agenda[] })),
    ];
    return todos.sort((a, b) => fechaOrden(b).localeCompare(fechaOrden(a)));
  }, [servicios, actividades, agendas]);

  const eventoSeleccionado = useMemo((): Evento | null => {
    if (servicioSeleccionado) return eventosOrdenados.find((e) => e.servicio?.id === servicioSeleccionado.id) ?? null;
    if (actividadSeleccionada) return eventosOrdenados.find((e) => e.actividad?.id === actividadSeleccionada.id) ?? null;
    return null;
  }, [eventosOrdenados, servicioSeleccionado, actividadSeleccionada]);

  function abrirNuevaReserva() {
    if (!servicioSeleccionado) return;
    setNuevaCorreo("");
    setNuevaAgendaId(agendasDelEvento[0]?.id ?? "");
    setNuevaFecha(hoyBogota());
    setNuevaHora("");
    setNuevaNota("");
    setErrorCrear(null);
    setDialogNuevaReserva(true);
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
      setDialogNuevaReserva(false);
      setRefrescarEn((n) => n + 1);
    } catch (e) {
      setErrorCrear(mensajeError(e, "No se pudo crear la reserva."));
    } finally {
      setCreando(false);
    }
  }

  async function abrirNuevaInscripcion() {
    if (!actividadSeleccionada) return;
    setNuevaCorreoInsc("");
    setNuevaSesionId("");
    setNuevaNotaInsc("");
    setErrorCrearInsc(null);
    setSesionesActividad([]);
    setDialogNuevaInscripcion(true);
    setCargandoSesiones(true);
    try {
      const sesiones = await listarSesiones(actividadSeleccionada.id);
      const disponibles = sesiones.filter((s) => s.activa && s.estado !== "finalizada");
      setSesionesActividad(disponibles);
      setNuevaSesionId(disponibles[0]?.id ?? "");
    } catch (e) {
      setErrorCrearInsc(mensajeError(e, "No se pudieron cargar las fechas del evento."));
    } finally {
      setCargandoSesiones(false);
    }
  }

  const nuevaInscripcionValida = nuevaCorreoInsc.trim() !== "" && nuevaSesionId !== "";

  async function crearManualInscripcion() {
    if (!nuevaInscripcionValida) return;
    setCreandoInsc(true);
    setErrorCrearInsc(null);
    try {
      await crearInscripcionManual({
        correo: nuevaCorreoInsc.trim(),
        sesion_id: Number(nuevaSesionId),
        notes: nuevaNotaInsc.trim() || undefined,
      });
      setDialogNuevaInscripcion(false);
      setRefrescarEn((n) => n + 1);
    } catch (e) {
      setErrorCrearInsc(mensajeError(e, "No se pudo crear la inscripción."));
    } finally {
      setCreandoInsc(false);
    }
  }

  const accionNueva = useMemo(() => {
    if (!puedeGestionar || !seleccion) return null;
    if (seleccion.tipo === "reserva") {
      return <Button variant="contained" startIcon={<AddIcon />} onClick={abrirNuevaReserva}>Nueva reserva manual</Button>;
    }
    return <Button variant="contained" startIcon={<AddIcon />} onClick={abrirNuevaInscripcion}>Nueva inscripción manual</Button>;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeGestionar, seleccion, agendasDelEvento]);

  const sinEventos = servicios.length === 0 && actividades.length === 0;

  return (
    <Box>
      <PageHeader
        titulo="Reservas"
        descripcion="Elige un evento para ver quién reservó o se inscribió: su historial completo, filtrable por estado y con cancelaciones."
        acciones={accionNueva}
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {cargando ? (
        <Loader />
      ) : sinEventos ? (
        <EmptyState titulo="Todavía no hay eventos" descripcion="Crea uno desde la sección Eventos." />
      ) : !seleccion ? (
        // --- Listado de eventos: mismo listado e información para los dos roles ---
        <Grid container spacing={2}>
          {eventosOrdenados.map((ev) => (
            <TarjetaEvento
              key={`${ev.tipo}-${(ev.servicio ?? ev.actividad)!.id}`}
              ev={ev}
              nombreArea={nombreArea}
              onClick={() => setSeleccion({ tipo: ev.tipo, id: (ev.servicio ?? ev.actividad)!.id })}
            />
          ))}
        </Grid>
      ) : (
        // --- Detalle del evento: misma vista para los dos roles; soloLectura quita acciones ---
        <Stack spacing={2}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => setSeleccion(null)} sx={{ alignSelf: "flex-start" }}>
            Volver al listado de eventos
          </Button>
          {eventoSeleccionado && <FichaEvento ev={eventoSeleccionado} nombreArea={nombreArea} />}
          {servicioSeleccionado && (
            <HistorialReservasPanel
              key={`reserva-${servicioSeleccionado.id}-${refrescarEn}`}
              servicio={servicioSeleccionado}
              soloLectura={!puedeGestionar}
            />
          )}
          {actividadSeleccionada && (
            <HistorialInscripcionesPanel
              key={`inscripcion-${actividadSeleccionada.id}-${refrescarEn}`}
              actividad={actividadSeleccionada}
              soloLectura={!puedeGestionar}
            />
          )}
        </Stack>
      )}

      <Dialog open={dialogNuevaReserva} onClose={() => setDialogNuevaReserva(false)} maxWidth="xs" fullWidth>
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
                {agendasDelEvento.map((a) => (
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
          <Button onClick={() => setDialogNuevaReserva(false)} disabled={creando}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={crearManual} disabled={creando || !nuevaValida}>
            Crear reserva
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={dialogNuevaInscripcion} onClose={() => setDialogNuevaInscripcion(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Nueva inscripción manual</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {errorCrearInsc && <Alert severity="error">{errorCrearInsc}</Alert>}
            <TextField
              label="Correo del colaborador"
              type="email"
              value={nuevaCorreoInsc}
              onChange={(e) => setNuevaCorreoInsc(e.target.value)}
              fullWidth
              autoFocus
            />
            <FormControl fullWidth disabled={cargandoSesiones}>
              <InputLabel id="nueva-inscripcion-sesion-label">Fecha del evento</InputLabel>
              <Select
                labelId="nueva-inscripcion-sesion-label"
                label="Fecha del evento"
                value={nuevaSesionId}
                onChange={(e) => setNuevaSesionId(e.target.value === "" ? "" : Number(e.target.value))}
              >
                {sesionesActividad.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.fecha} · {s.hora_inicio.slice(0, 5)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Notas"
              value={nuevaNotaInsc}
              onChange={(e) => setNuevaNotaInsc(e.target.value)}
              multiline
              minRows={2}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogNuevaInscripcion(false)} disabled={creandoInsc}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={crearManualInscripcion} disabled={creandoInsc || !nuevaInscripcionValida}>
            Crear inscripción
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
