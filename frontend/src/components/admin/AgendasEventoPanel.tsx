import { useState } from "react";
import { Alert, Box, Button, Chip, Paper, Stack, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import type { Agenda, Area, ReservaAdmin, Servicio } from "../../types";
import { cambiarEstadoAgenda } from "../../services/agendas";
import { mensajeError } from "../../utils/errors";
import { resumenDiasSemana } from "../../utils/fechas";
import ReservasAfectadasDialog from "../ReservasAfectadasDialog";
import AgendaFormDialog from "./AgendaFormDialog";

interface Props {
  servicio: Servicio;
  /** Agendas de este evento. */
  agendas: Agenda[];
  areas: Area[];
  onCambio: () => void;
}

/** Agendas de un evento de reserva (una por área): dónde se atiende, en qué horario y con qué
 * duración de turnos. Se gestionan dentro del propio evento, sin cambiar de sección. Los
 * cambios que dejarían reservas futuras fuera de los nuevos turnos se bloquean hasta
 * resolverlas (lo valida el backend). */
export default function AgendasEventoPanel({ servicio, agendas, areas, onCambio }: Props) {
  const [formAbierto, setFormAbierto] = useState(false);
  const [editando, setEditando] = useState<Agenda | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [afectadas, setAfectadas] = useState<{ nombre: string; reservas: ReservaAdmin[] } | null>(null);

  const area = (id: number) => areas.find((a) => a.id === id);
  const quedanAreas = areas.some((a) => a.activo && !agendas.some((ag) => ag.area_id === a.id));

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
    <Box>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={1.5} sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Cada agenda define en qué área se ofrece el evento, su horario de atención, los días y la duración de los turnos.
        </Typography>
        <Button
          startIcon={<AddIcon />} variant="outlined" size="small" sx={{ flexShrink: 0 }} disabled={!quedanAreas}
          onClick={() => { setEditando(null); setFormAbierto(true); }}
        >
          Agregar agenda
        </Button>
      </Stack>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Stack spacing={1}>
        {agendas.length === 0 && (
          <Alert severity="warning">Este evento no tiene agendas: no se muestra en el portal hasta que le agregues una.</Alert>
        )}
        {agendas.map((a) => {
          const suArea = area(a.area_id);
          return (
            <Paper key={a.id} variant="outlined" sx={{ p: 1.75 }}>
              <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={1}>
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography variant="body2" fontWeight={700}>{suArea?.nombre ?? `Área #${a.area_id}`}</Typography>
                    <Chip size="small" label={a.activo ? "Activa" : "Inactiva"} color={a.activo ? "success" : "default"}
                      variant={a.activo ? "filled" : "outlined"} />
                    {suArea && !suArea.activo && <Chip size="small" color="warning" variant="outlined" label="Área inactiva" />}
                  </Stack>
                  {a.nombre !== `${servicio.nombre} - ${suArea?.nombre}` && (
                    <Typography variant="caption" display="block" sx={{ wordBreak: "break-word" }}>{a.nombre}</Typography>
                  )}
                  <Typography variant="caption" color="text.secondary" display="block">
                    {resumenDiasSemana(a.dias_habilitados)} · {a.hora_inicio.slice(0, 5)}–{a.hora_fin.slice(0, 5)}
                    {a.almuerzo_inicio ? ` (almuerzo ${a.almuerzo_inicio.slice(0, 5)}–${a.almuerzo_fin?.slice(0, 5)})` : ""}
                    {" · "}Turnos de {a.duracion_minutos} min
                  </Typography>
                </Box>
                <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                  <Button size="small" onClick={() => { setEditando(a); setFormAbierto(true); }}>Editar</Button>
                  <Button size="small" color={a.activo ? "error" : "primary"} onClick={() => alternar(a)}>
                    {a.activo ? "Desactivar" : "Activar"}
                  </Button>
                </Stack>
              </Stack>
            </Paper>
          );
        })}
      </Stack>
      {!quedanAreas && agendas.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
          El evento ya tiene agenda en todas las áreas activas. Para ofrecerlo en otra, créala primero en «Áreas».
        </Typography>
      )}

      <AgendaFormDialog
        abierto={formAbierto}
        agenda={editando}
        areas={areas}
        servicios={[servicio]}
        servicioFijo={servicio}
        areasOcupadas={agendas.filter((a) => a.id !== editando?.id).map((a) => a.area_id)}
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
    </Box>
  );
}
