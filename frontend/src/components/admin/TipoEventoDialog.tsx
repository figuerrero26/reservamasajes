import { useEffect, useState, type ReactNode } from "react";
import {
  Box, Button, Card, CardActionArea, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography,
  useMediaQuery, useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import EventAvailableOutlinedIcon from "@mui/icons-material/EventAvailableOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import type { TipoEvento } from "./ReglaParticipacionCampo";

export const NOMBRE_TIPO_EVENTO: Record<TipoEvento, string> = {
  reserva: "Evento de reserva",
  inscripcion: "Evento de inscripción",
};

const OPCIONES: { tipo: TipoEvento; icono: ReactNode; resumen: string; ejemplo: string; incluye: string[] }[] = [
  {
    tipo: "reserva",
    icono: <EventAvailableOutlinedIcon />,
    resumen: "Cada persona elige un turno individual dentro de una agenda con horario.",
    ejemplo: "Ej.: masajes, asesorías, valoraciones.",
    incluye: ["Agendas por área", "Horario de atención", "Duración de los turnos", "Restricciones de reserva"],
  },
  {
    tipo: "inscripcion",
    icono: <GroupsOutlinedIcon />,
    resumen: "Las personas se inscriben y ocupan un cupo en una fecha y horario definidos.",
    ejemplo: "Ej.: caminatas, talleres, charlas, competencias.",
    incluye: ["Fecha y horario de realización", "Límite de participantes", "Periodo de inscripción", "Restricciones de inscripción"],
  },
];

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  onElegir: (tipo: TipoEvento) => void;
}

/** Primer paso de «Nuevo evento»: elegir el tipo. Cada tipo abre su propio formulario, que
 * solo muestra las configuraciones que le corresponden (y el backend rechaza las del otro). */
export default function TipoEventoDialog({ abierto, onCerrar, onElegir }: Props) {
  const theme = useTheme();
  const pantallaChica = useMediaQuery(theme.breakpoints.down("sm"));
  const [elegido, setElegido] = useState<TipoEvento | null>(null);

  useEffect(() => {
    if (abierto) setElegido(null);
  }, [abierto]);

  return (
    <Dialog open={abierto} onClose={onCerrar} maxWidth="md" fullWidth fullScreen={pantallaChica}>
      <DialogTitle>
        Nuevo evento
        <Typography variant="body2" color="text.secondary" component="span" sx={{ display: "block", fontWeight: 400, mt: 0.5 }}>
          ¿Qué tipo de evento quieres crear? Cada tipo tiene su propia configuración.
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ pt: 0.5 }}>
          {OPCIONES.map((o) => {
            const activo = elegido === o.tipo;
            return (
              <Card
                key={o.tipo}
                sx={{
                  flex: 1, borderWidth: 2, borderColor: activo ? "primary.main" : "divider",
                  bgcolor: activo ? alpha(theme.palette.primary.main, 0.06) : "background.paper",
                }}
              >
                <CardActionArea
                  onClick={() => setElegido(o.tipo)}
                  onDoubleClick={() => onElegir(o.tipo)}
                  aria-pressed={activo}
                  sx={{ height: "100%", p: { xs: 2, sm: 2.5 }, display: "flex", flexDirection: "column", alignItems: "stretch" }}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1.5 }}>
                    <Box sx={{ color: "primary.main", display: "flex", "& svg": { fontSize: 34 } }}>{o.icono}</Box>
                    {activo && <CheckCircleIcon color="primary" />}
                  </Stack>
                  <Typography variant="h6" component="h3" sx={{ mb: 0.75 }}>{NOMBRE_TIPO_EVENTO[o.tipo]}</Typography>
                  <Typography variant="body2" sx={{ mb: 0.5 }}>{o.resumen}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{o.ejemplo}</Typography>
                  <Box component="ul" sx={{ m: 0, pl: 2.25, color: "text.secondary", typography: "body2", "& li": { mb: 0.25 } }}>
                    {o.incluye.map((i) => <li key={i}>{i}</li>)}
                  </Box>
                </CardActionArea>
              </Card>
            );
          })}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCerrar}>Cancelar</Button>
        <Button variant="contained" disabled={!elegido} onClick={() => elegido && onElegir(elegido)}>
          Continuar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
