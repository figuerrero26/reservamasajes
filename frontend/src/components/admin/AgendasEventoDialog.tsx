import { useState } from "react";
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import type { Agenda, Area, ReservaAdmin, Servicio } from "../../types";
import { cambiarEstadoAgenda } from "../../services/agendas";
import { mensajeError } from "../../utils/errors";
import ReservasAfectadasDialog from "../ReservasAfectadasDialog";
import AgendaFormDialog from "./AgendaFormDialog";

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function resumenDias(csv: string): string {
  const dias = csv.split(",").map(Number).filter((d) => !Number.isNaN(d)).sort();
  if (dias.join(",") === "0,1,2,3,4") return "Lun a Vie";
  if (dias.join(",") === "0,1,2,3,4,5,6") return "Todos los días";
  return dias.map((d) => DIAS[d]).join(", ");
}

interface Props {
  servicio: Servicio | null;
  agendas: Agenda[];
  areas: Area[];
  servicios: Servicio[];
  onCerrar: () => void;
  onCambio: () => void;
}

/** Agendas de un evento por turnos (una por área): el lugar donde se define dónde, cuándo y
 * con qué duración se ofrece. Se gestionan desde el propio evento, sin cambiar de sección. */
export default function AgendasEventoDialog({ servicio, agendas, areas, servicios, onCerrar, onCambio }: Props) {
  const [formAbierto, setFormAbierto] = useState(false);
  const [editando, setEditando] = useState<Agenda | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [afectadas, setAfectadas] = useState<{ nombre: string; reservas: ReservaAdmin[] } | null>(null);

  const propias = servicio ? agendas.filter((a) => a.servicio_id === servicio.id) : [];
  const nombreArea = (id: number) => areas.find((a) => a.id === id)?.nombre ?? `Área #${id}`;
  const areaActiva = (id: number) => areas.find((a) => a.id === id)?.activo ?? false;

  async function alternar(a: Agenda) {
    setError(null);
    try {
      const r = await cambiarEstadoAgenda(a.id, !a.activo);
      if (r.reservas_afectadas.length > 0) setAfectadas({ nombre: a.nombre, reservas: r.reservas_afectadas });
      onCambio();
    } catch (e) {
      setError(mensajeError(e, "No se pudo cambiar el estado de la agenda."));
    }
  }

  return (
    <>
      <Dialog open={!!servicio} onClose={onCerrar} maxWidth="sm" fullWidth>
        <DialogTitle>Agendas de «{servicio?.nombre}»</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Cada agenda define en qué área se ofrece el evento, su horario y la duración de los turnos.
          </Typography>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Stack spacing={1}>
            {propias.length === 0 && (
              <Alert severity="warning">Este evento no tiene agendas: no se muestra en el portal hasta que le agregues una.</Alert>
            )}
            {propias.map((a) => (
              <Paper key={a.id} variant="outlined" sx={{ p: 1.75 }}>
                <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={1}>
                  <Box sx={{ minWidth: 0 }}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Typography variant="body2" fontWeight={700}>{nombreArea(a.area_id)}</Typography>
                      <Chip size="small" label={a.activo ? "Activa" : "Inactiva"} color={a.activo ? "success" : "default"}
                        variant={a.activo ? "filled" : "outlined"} />
                      {!areaActiva(a.area_id) && <Chip size="small" color="warning" variant="outlined" label="Área inactiva" />}
                    </Stack>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {a.hora_inicio.slice(0, 5)}–{a.hora_fin.slice(0, 5)}
                      {a.almuerzo_inicio ? ` (almuerzo ${a.almuerzo_inicio.slice(0, 5)}–${a.almuerzo_fin?.slice(0, 5)})` : ""}
                      {" · "}Turnos de {a.duracion_minutos} min · {resumenDias(a.dias_habilitados)}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={0.5}>
                    <Button size="small" onClick={() => { setEditando(a); setFormAbierto(true); }}>Editar</Button>
                    <Button size="small" color={a.activo ? "error" : "primary"} onClick={() => alternar(a)}>
                      {a.activo ? "Desactivar" : "Activar"}
                    </Button>
                  </Stack>
                </Stack>
              </Paper>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ justifyContent: "space-between" }}>
          <Button startIcon={<AddIcon />} variant="outlined" onClick={() => { setEditando(null); setFormAbierto(true); }}>
            Agregar en otra área
          </Button>
          <Button onClick={onCerrar}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      <AgendaFormDialog
        abierto={formAbierto}
        agenda={editando}
        areas={areas}
        servicios={servicios}
        servicioFijo={servicio}
        onCerrar={() => setFormAbierto(false)}
        onGuardada={() => { setFormAbierto(false); onCambio(); }}
      />

      <ReservasAfectadasDialog
        abierto={!!afectadas}
        titulo={`«${afectadas?.nombre ?? ""}» desactivada`}
        descripcion="La agenda ya no acepta reservas nuevas. Estas reservas futuras siguen vigentes: puedes mantenerlas o cancelarlas y avisar a cada colaborador."
        reservas={afectadas?.reservas ?? []}
        motivoSugerido="El servicio no estará disponible en esa área."
        onCerrar={() => setAfectadas(null)}
      />
    </>
  );
}
