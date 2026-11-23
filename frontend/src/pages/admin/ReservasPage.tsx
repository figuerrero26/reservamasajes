import { useEffect, useMemo, useState } from "react";
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel,
  ListSubheader, MenuItem, Select, Stack, TextField,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import type { Actividad, Agenda, Servicio, Sesion } from "../../types";
import { listarAgendas } from "../../services/agendas";
import { listarServicios } from "../../services/servicios";
import { crearReservaManual } from "../../services/reservas";
import { listarActividades, listarSesiones } from "../../services/actividades";
import { crearInscripcionManual } from "../../services/inscripciones";
import { mensajeError } from "../../utils/errors";
import { hoyBogota } from "../../utils/fechas";
import { useAuth } from "../../hooks/useAuth";
import { ROL_ADMINISTRADOR } from "../../constants/roles";
import PageHeader from "../../components/PageHeader";
import Loader from "../../components/Loader";
import EmptyState from "../../components/EmptyState";
import HistorialReservasPanel from "../../components/admin/HistorialReservasPanel";
import HistorialInscripcionesPanel from "../../components/admin/HistorialInscripcionesPanel";

type Seleccion = { tipo: "reserva"; id: number } | { tipo: "inscripcion"; id: number };

function claveDe(s: Seleccion): string {
  return `${s.tipo}-${s.id}`;
}

export default function ReservasPage() {
  const { rol } = useAuth();
  const puedeGestionar = rol === ROL_ADMINISTRADOR;

  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [agendas, setAgendas] = useState<Agenda[]>([]);
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
    Promise.all([listarServicios(), listarActividades(), listarAgendas()])
      .then(([sv, ac, ag]) => {
        setServicios(sv);
        setActividades(ac);
        setAgendas(ag);
        setSeleccion((actual) => {
          if (actual) return actual;
          if (sv.length > 0) return { tipo: "reserva", id: sv[0].id };
          if (ac.length > 0) return { tipo: "inscripcion", id: ac[0].id };
          return null;
        });
      })
      .catch((e) => setError(mensajeError(e, "No se pudieron cargar los eventos.")))
      .finally(() => setCargando(false));
  }, []);

  const servicioSeleccionado = seleccion?.tipo === "reserva" ? servicios.find((s) => s.id === seleccion.id) ?? null : null;
  const actividadSeleccionada = seleccion?.tipo === "inscripcion" ? actividades.find((a) => a.id === seleccion.id) ?? null : null;
  const agendasDelEvento = agendas.filter((a) => a.servicio_id === servicioSeleccionado?.id && a.activo);

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
        descripcion="Elige un evento para ver quién reservó o se inscribió: su historial completo, filtrable por estado, con asistencia y cancelaciones."
        acciones={accionNueva}
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {cargando ? (
        <Loader />
      ) : sinEventos ? (
        <EmptyState titulo="Todavía no hay eventos" descripcion="Crea uno desde la sección Eventos." />
      ) : (
        <>
          <FormControl size="small" sx={{ mb: 3, minWidth: 280 }}>
            <InputLabel id="reservas-evento-label">Evento</InputLabel>
            <Select
              labelId="reservas-evento-label"
              label="Evento"
              value={seleccion ? claveDe(seleccion) : ""}
              onChange={(e) => {
                const [tipo, idTexto] = e.target.value.split("-");
                setSeleccion({ tipo: tipo as "reserva" | "inscripcion", id: Number(idTexto) });
              }}
            >
              {servicios.length > 0 && <ListSubheader>Reservas</ListSubheader>}
              {servicios.map((s) => (
                <MenuItem key={`reserva-${s.id}`} value={`reserva-${s.id}`}>
                  {s.nombre}{s.estado_vigencia === "finalizado" ? " (finalizado)" : ""}
                </MenuItem>
              ))}
              {actividades.length > 0 && <ListSubheader>Inscripciones</ListSubheader>}
              {actividades.map((a) => (
                <MenuItem key={`inscripcion-${a.id}`} value={`inscripcion-${a.id}`}>
                  {a.nombre}{a.estado_vigencia === "finalizado" ? " (finalizado)" : ""}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

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
        </>
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
