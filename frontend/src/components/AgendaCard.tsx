import { Card, CardActionArea, CardContent, Chip, Stack, Typography } from "@mui/material";
import PlaceIcon from "@mui/icons-material/Place";
import SpaIcon from "@mui/icons-material/Spa";
import type { AgendaPublica } from "../types";

interface Props {
  agenda: AgendaPublica;
  onClick: () => void;
}

export default function AgendaCard({ agenda, onClick }: Props) {
  return (
    <Card variant="outlined">
      <CardActionArea onClick={onClick} sx={{ p: 1 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>{agenda.nombre}</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip size="small" icon={<SpaIcon />} label={agenda.servicio_nombre} />
            <Chip size="small" icon={<PlaceIcon />} label={agenda.area_nombre} variant="outlined" />
            <Chip size="small" label={`${agenda.duracion_minutos} min`} variant="outlined" />
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
