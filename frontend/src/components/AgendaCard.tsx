import { Card, CardActionArea, CardContent, Stack, Typography } from "@mui/material";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import type { AgendaPublica } from "../types";
import { formatearHora, resumenDiasSemana } from "../utils/fechas";

interface Props {
  agenda: AgendaPublica;
  onClick: () => void;
}

/** Nombre propio de la agenda (espacio o profesional), si el administrador le puso uno
 * distinto del automático «Evento - Área». */
export function nombrePropioAgenda(agenda: AgendaPublica): string | null {
  const automatico = `${agenda.servicio_nombre} - ${agenda.area_nombre}`;
  return agenda.nombre && agenda.nombre !== automatico ? agenda.nombre : null;
}

/** Opción de lugar cuando un evento de reserva se ofrece en más de un área: dónde, en qué
 * horario de atención y cuánto dura cada sesión. */
export default function AgendaCard({ agenda, onClick }: Props) {
  const propio = nombrePropioAgenda(agenda);
  const horario = agenda.hora_inicio && agenda.hora_fin
    ? `${resumenDiasSemana(agenda.dias_habilitados)} · ${formatearHora(agenda.hora_inicio)} a ${formatearHora(agenda.hora_fin)}`
    : null;
  return (
    <Card sx={{ height: "100%", "&:hover": { borderColor: "text.primary" } }}>
      <CardActionArea onClick={onClick} sx={{ height: "100%" }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
            <Stack spacing={0.5} sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <PlaceOutlinedIcon fontSize="small" color="action" />
                <Typography variant="subtitle1">{agenda.area_nombre}</Typography>
              </Stack>
              {propio && <Typography variant="body2">{propio}</Typography>}
              {agenda.area_descripcion && (
                <Typography variant="body2" color="text.secondary">{agenda.area_descripcion}</Typography>
              )}
              <Typography variant="body2" color="text.secondary">
                {horario ? `${horario} · ` : ""}Sesiones de {agenda.duracion_minutos} min
              </Typography>
            </Stack>
            <ArrowForwardIcon color="action" sx={{ flexShrink: 0 }} />
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
