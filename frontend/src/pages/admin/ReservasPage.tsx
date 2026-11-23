import { useEffect, useState } from "react";
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel,
  MenuItem, Select, Stack, TextField,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import type { Agenda, Servicio } from "../../types";
import { listarAgendas } from "../../services/agendas";
import { listarServicios } from "../../services/servicios";
import { crearReservaManual } from "../../services/reservas";
import { mensajeError } from "../../utils/errors";
import { hoyBogota } from "../../utils/fechas";
import { useAuth } from "../../hooks/useAuth";
import { ROL_ADMINISTRADOR } from "../../constants/roles";
import PageHeader from "../../components/PageHeader";
import Loader from "../../components/Loader";
import EmptyState from "../../components/EmptyState";
import HistorialReservasPanel from "../../components/admin/HistorialReservasPanel";

export default function ReservasPage() {
  const { rol } = useAuth();
  const puedeGestionar = rol === ROL_ADMINISTRADOR;

  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [servicioId, setServicioId] = useState<number | "">("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refrescarEn, setRefrescarEn] = useState(0);

  const [dialogNueva, setDialogNueva] = useState(false);
  const [nuevaCorreo, setNuevaCorreo] = useState("");
  const [nuevaAgendaId, setNuevaAgendaId] = useState<number | "">("");
  const [nuevaFecha, setNuevaFecha] = useState("");
  const [nuevaHora, setNuevaHora] = useState("");
  const [nuevaNota, setNuevaNota] = useState("");
  const [creando, setCreando] = useState(false);
  const [errorCrear, setErrorCrear] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listarServicios(), listarAgendas()])
      .then(([sv, ag]) => {
        setServicios(sv);
        setAgendas(ag);
        setServicioId((actual) => (actual === "" && sv.length > 0 ? sv[0].id : actual));
      })
      .catch((e) => setError(mensajeError(e, "No se pudieron cargar los eventos.")))
      .finally(() => setCargando(false));
  }, []);

  const servicioSeleccionado = servicios.find((s) => s.id === servicioId) ?? null;
  const agendasDelEvento = agendas.filter((a) => a.servicio_id === servicioId && a.activo);

  function abrirNueva() {
    setNuevaCorreo("");
    setNuevaAgendaId(agendasDelEvento[0]?.id ?? "");
    setNuevaFecha(hoyBogota());
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
      setRefrescarEn((n) => n + 1);
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
        descripcion="Elige un evento para ver quién reservó qué: su historial completo, filtrable por estado, con asistencia y cancelaciones."
        acciones={puedeGestionar && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={abrirNueva} disabled={servicios.length === 0}>
            Nueva reserva manual
          </Button>
        )}
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {cargando ? (
        <Loader />
      ) : servicios.length === 0 ? (
        <EmptyState titulo="Todavía no hay eventos de reserva" descripcion="Crea uno desde la sección Eventos." />
      ) : (
        <>
          <FormControl size="small" sx={{ mb: 3, minWidth: 280 }}>
            <InputLabel id="reservas-evento-label">Evento</InputLabel>
            <Select
              labelId="reservas-evento-label"
              label="Evento"
              value={servicioId}
              onChange={(e) => setServicioId(Number(e.target.value))}
            >
              {servicios.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.nombre}{s.estado_vigencia === "finalizado" ? " (finalizado)" : ""}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {servicioSeleccionado && (
            <HistorialReservasPanel
              key={`${servicioSeleccionado.id}-${refrescarEn}`}
              servicio={servicioSeleccionado}
              soloLectura={!puedeGestionar}
            />
          )}
        </>
      )}

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
