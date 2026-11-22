import { FormControl, FormControlLabel, InputLabel, MenuItem, Select, Stack, Switch, TextField } from "@mui/material";
import type { CampoFormulario } from "../types";

type Respuestas = Record<string, string | number | boolean | null>;

interface Props {
  campos: CampoFormulario[];
  valores: Respuestas;
  onChange: (valores: Respuestas) => void;
}

/** Etiquetas de los campos obligatorios sin responder (validación previa al envío; el
 * backend vuelve a validar). Un sí/no nunca falta: "no" es una respuesta. */
export function camposFaltantes(campos: CampoFormulario[], valores: Respuestas): string[] {
  return campos
    .filter((c) => c.requerido && c.tipo !== "si_no")
    .filter((c) => {
      const v = valores[c.clave];
      return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
    })
    .map((c) => c.etiqueta);
}

/** Renderiza el formulario de inscripción configurado por el admin para una actividad (ver
 * Actividad.campos_formulario) — el mismo set de tipos que valida el backend. */
export default function FormularioDinamico({ campos, valores, onChange }: Props) {
  if (campos.length === 0) return null;

  function set(clave: string, valor: string | number | boolean | null) {
    onChange({ ...valores, [clave]: valor });
  }

  return (
    <Stack spacing={2}>
      {campos.map((campo) => {
        const valor = valores[campo.clave] ?? (campo.tipo === "si_no" ? false : "");
        const etiqueta = campo.requerido ? `${campo.etiqueta} *` : campo.etiqueta;

        if (campo.tipo === "si_no") {
          return (
            <FormControlLabel
              key={campo.clave}
              control={<Switch checked={Boolean(valor)} onChange={(e) => set(campo.clave, e.target.checked)} />}
              label={etiqueta}
            />
          );
        }

        if (campo.tipo === "seleccion") {
          return (
            <FormControl key={campo.clave} fullWidth>
              <InputLabel id={`campo-${campo.clave}`}>{etiqueta}</InputLabel>
              <Select
                labelId={`campo-${campo.clave}`}
                label={etiqueta}
                value={valor as string}
                onChange={(e) => set(campo.clave, e.target.value)}
              >
                {(campo.opciones ?? []).map((opcion) => (
                  <MenuItem key={opcion} value={opcion}>
                    {opcion}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          );
        }

        if (campo.tipo === "numero") {
          return (
            <TextField
              key={campo.clave}
              label={etiqueta}
              type="number"
              value={valor}
              onChange={(e) => set(campo.clave, e.target.value === "" ? null : Number(e.target.value))}
              fullWidth
            />
          );
        }

        return (
          <TextField
            key={campo.clave}
            label={etiqueta}
            value={valor}
            onChange={(e) => set(campo.clave, e.target.value)}
            inputProps={{ maxLength: 1000 }}
            fullWidth
          />
        );
      })}
    </Stack>
  );
}
