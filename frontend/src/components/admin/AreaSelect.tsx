import { MenuItem, TextField } from "@mui/material";
import type { Area } from "../../types";

interface Props {
  areas: Area[];
  valor: number | "";
  onChange: (areaId: number) => void;
  disabled?: boolean;
  helperText?: string;
  label?: string;
  /** Áreas que no se ofrecen (p. ej. las que ya tienen agenda en el mismo evento). */
  excluir?: number[];
}

/** Selector obligatorio de área: es el primer dato al crear un evento, una actividad o una
 * agenda. Ofrece las áreas activas; si se edita algo cuya área ya se desactivó, la incluye
 * igual (marcada) para no romper el formulario. */
export default function AreaSelect({ areas, valor, onChange, disabled, helperText, label = "Área", excluir = [] }: Props) {
  const opciones = areas.filter((a) => a.id === valor || (a.activo && !excluir.includes(a.id)));
  return (
    <TextField
      select
      required
      fullWidth
      label={label}
      value={valor}
      onChange={(e) => onChange(Number(e.target.value))}
      disabled={disabled}
      error={valor === ""}
      helperText={valor === "" ? "Selecciona el área (obligatorio)." : helperText}
    >
      {opciones.length === 0 && <MenuItem value="" disabled>No hay áreas activas disponibles: créalas en la sección Áreas</MenuItem>}
      {opciones.map((a) => (
        <MenuItem key={a.id} value={a.id}>
          {a.nombre}{a.activo ? "" : " (inactiva)"}
        </MenuItem>
      ))}
    </TextField>
  );
}
