import { useEffect, useState } from "react";
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel, MenuItem, Stack,
  Switch, TextField, Typography, useMediaQuery, useTheme,
} from "@mui/material";
import type { Agenda, Area, ReservaAdmin, Servicio } from "../../types";
import { actualizarAgenda, crearAgenda } from "../../services/agendas";
import { mensajeError, reservasAfectadasDe } from "../../utils/errors";
import ReservasAfectadasDialog from "../ReservasAfectadasDialog";
import AreaSelect from "./AreaSelect";
import HorarioCampos, {
  HORARIO_POR_DEFECTO, errorHorario, horarioAPayload, horarioDesdeAgenda, type HorarioForm,
} from "./HorarioCampos";

interface Props {
  abierto: boolean;
  /** null = nueva agenda. */
  agenda: Agenda | null;
  areas: Area[];
  servicios: Servicio[];
  /** Al abrirse desde un evento: el evento queda fijo (no se muestra el selector). */
  servicioFijo?: Servicio | null;
  /** Áreas que ya tienen agenda en ese evento (no se ofrecen). */
  areasOcupadas?: number[];
  onCerrar: () => void;
  onGuardada: () => void;
}

/** Alta y edición de una agenda de un evento de reserva (área + horario de atención +
 * duración de los turnos). El área es obligatoria. Si un cambio dejaría reservas futuras
 * fuera de los nuevos turnos, el backend lo rechaza y se muestran esas reservas para
 * resolverlas antes de reintentar. */
export default function AgendaFormDialog({
  abierto, agenda, areas, servicios, servicioFijo, areasOcupadas = [], onCerrar, onGuardada,
}: Props) {
  const theme = useTheme();
  const pantallaChica = useMediaQuery(theme.breakpoints.down("sm"));
  const [areaId, setAreaId] = useState<number | "">("");
  const [servicioId, setServicioId] = useState<number | "">("");
  const [nombre, setNombre] = useState("");
  const [horario, setHorario] = useState<HorarioForm>(HORARIO_POR_DEFECTO);
  const [activo, setActivo] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [afectadas, setAfectadas] = useState<{ descripcion: string; reservas: ReservaAdmin[] } | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setAreaId(agenda?.area_id ?? "");
    setServicioId(agenda?.servicio_id ?? servicioFijo?.id ?? "");
    setNombre(agenda?.nombre ?? "");
    setHorario(agenda ? horarioDesdeAgenda(agenda) : HORARIO_POR_DEFECTO);
    setActivo(agenda?.activo ?? true);
    setError(null);
  }, [abierto, agenda, servicioFijo]);

  const opcionesServicio = servicios.filter((s) => s.activo || s.id === servicioId);
  const nombreSugerido = () => {
    const s = servicios.find((x) => x.id === servicioId)?.nombre ?? servicioFijo?.nombre;
    const a = areas.find((x) => x.id === areaId)?.nombre;
    return s && a ? `${s} - ${a}` : "";
  };
  const problema = areaId === "" ? "Selecciona el área." : servicioId === "" ? "Selecciona el evento." : errorHorario(horario);

  async function guardar() {
    if (problema || areaId === "" || servicioId === "") return;
    setGuardando(true);
    setError(null);
    const payload = {
      nombre: nombre.trim() || nombreSugerido(),
      area_id: areaId,
      servicio_id: servicioId,
      ...horarioAPayload(horario),
      activo,
    };
    try {
      if (agenda) await actualizarAgenda(agenda.id, payload);
      else await crearAgenda(payload);
      onGuardada();
    } catch (e) {
      const reservas = reservasAfectadasDe(e);
      if (reservas.length > 0) {
        setAfectadas({
          descripcion: `${mensajeError(e)} Puedes cancelar estas reservas (avisando a cada colaborador) y luego volver a guardar, o mantener la configuración actual.`,
          reservas,
        });
      }
      setError(mensajeError(e, "No se pudo guardar la agenda."));
    } finally {
      setGuardando(false);
    }
  }

  const titulo = agenda ? "Editar agenda" : servicioFijo ? `Nueva agenda de «${servicioFijo.nombre}»` : "Nueva agenda";

  return (
    <>
      <Dialog open={abierto} onClose={() => !guardando && onCerrar()} maxWidth="sm" fullWidth fullScreen={pantallaChica}>
        <DialogTitle sx={{ wordBreak: "break-word" }}>{titulo}</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <AreaSelect areas={areas} valor={areaId} onChange={setAreaId} label="Área (lugar)" excluir={areasOcupadas} />
            {!servicioFijo && (
              <TextField
                select
                required
                label="Evento"
                value={servicioId}
                onChange={(e) => setServicioId(Number(e.target.value))}
                fullWidth
              >
                {opcionesServicio.map((s) => (
                  <MenuItem key={s.id} value={s.id}>{s.nombre}{s.activo ? "" : " (inactivo)"}</MenuItem>
                ))}
              </TextField>
            )}
            <TextField
              label="Espacio o profesional (opcional)"
              placeholder={nombreSugerido() || "Ej.: Sala de bienestar · Terapeuta Ana"}
              helperText="Lo ve el colaborador al elegir dónde reservar. Si lo dejas vacío se usa «Evento - Área»."
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              inputProps={{ maxLength: 140 }}
              fullWidth
            />
            <Divider />
            <Typography variant="subtitle2">Horario de atención y turnos</Typography>
            <HorarioCampos valor={horario} onChange={setHorario} />
            {agenda && (
              <FormControlLabel control={<Switch checked={activo} onChange={(e) => setActivo(e.target.checked)} />} label="Agenda activa" />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onCerrar} disabled={guardando}>Cancelar</Button>
          <Button variant="contained" onClick={guardar} disabled={guardando || !!problema}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
        </DialogActions>
      </Dialog>

      <ReservasAfectadasDialog
        abierto={!!afectadas}
        titulo="No se puede aplicar el cambio todavía"
        descripcion={afectadas?.descripcion ?? ""}
        reservas={afectadas?.reservas ?? []}
        motivoSugerido="Cambio en el horario de atención."
        onCerrar={() => setAfectadas(null)}
      />
    </>
  );
}
