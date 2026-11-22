import { Card, CardActionArea, CardContent, Stack, Typography } from "@mui/material";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import type { AgendaPublica } from "../types";

interface Props {
  agenda: AgendaPublica;
  onClick: () => void;
}

/** Opción de área cuando un evento se ofrece en más de un lugar. */
export default function AgendaCard({ agenda, onClick }: Props) {
  return (
    <Card sx={{ height: "100%", "&:hover": { borderColor: "text.primary" } }}>
      <CardActionArea onClick={onClick} sx={{ height: "100%" }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
            <Stack spacing={0.5}>
              <Stack direction="row" spacing={1} alignItems="center">
                <PlaceOutlinedIcon fontSize="small" color="action" />
                <Typography variant="subtitle1">{agenda.area_nombre}</Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                Turnos de {agenda.duracion_minutos} min
              </Typography>
            </Stack>
            <ArrowForwardIcon color="action" />
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
