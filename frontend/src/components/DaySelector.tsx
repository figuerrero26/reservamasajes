import { Tab, Tabs } from "@mui/material";
import { formatearFecha, nombreDia } from "../utils/fechas";

interface Props {
  dias: string[];
  seleccionado: string;
  onSeleccionar: (fecha: string) => void;
}

export default function DaySelector({ dias, seleccionado, onSeleccionar }: Props) {
  return (
    <Tabs
      value={seleccionado}
      onChange={(_, v) => onSeleccionar(v)}
      variant="scrollable"
      scrollButtons="auto"
      allowScrollButtonsMobile
      sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}
    >
      {dias.map((fecha) => (
        <Tab
          key={fecha}
          value={fecha}
          label={`${nombreDia(fecha).slice(0, 3)} ${formatearFecha(fecha)}`}
        />
      ))}
    </Tabs>
  );
}
