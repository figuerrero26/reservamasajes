import {
  Box, Button, FormControl, FormControlLabel, Grid, IconButton, InputLabel, MenuItem, Select, Stack, Switch, TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import type { CampoFormulario, TipoCampoFormulario } from "../../types";

const TIPOS_CAMPO: { value: TipoCampoFormulario; label: string }[] = [
  { value: "texto", label: "Texto" },
  { value: "numero", label: "Número" },
  { value: "si_no", label: "Sí / No" },
  { value: "seleccion", label: "Selección" },
];

export function errorPreguntas(campos: CampoFormulario[]): string | null {
  if (new Set(campos.map((c) => c.clave)).size !== campos.length) return "Cada pregunta debe tener una clave distinta.";
  if (campos.some((c) => !c.clave.trim() || !c.etiqueta.trim() || (c.tipo === "seleccion" && !(c.opciones ?? []).length))) {
    return "Completa las preguntas del formulario de inscripción.";
  }
  return null;
}

/** Preguntas adicionales que se piden al inscribirse (talla, restricciones médicas…). Propias
 * de los eventos de inscripción. */
export default function PreguntasFormularioCampos({ valor, onChange }: { valor: CampoFormulario[]; onChange: (c: CampoFormulario[]) => void }) {
  const actualizar = (idx: number, cambios: Partial<CampoFormulario>) =>
    onChange(valor.map((c, i) => (i === idx ? { ...c, ...cambios } : c)));

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }} flexWrap="wrap" useFlexGap spacing={1}>
        <Typography variant="body2" color="text.secondary">
          {valor.length === 0 ? "Sin preguntas adicionales: solo se pide confirmar la inscripción." : `${valor.length} pregunta(s).`}
        </Typography>
        <Button size="small" startIcon={<AddIcon />}
          onClick={() => onChange([...valor, { clave: "", etiqueta: "", tipo: "texto", requerido: false, opciones: [] }])}>
          Agregar pregunta
        </Button>
      </Stack>
      <Stack spacing={1.5}>
        {valor.map((campo, idx) => (
          <Box key={idx} sx={{ p: 1.5, border: 1, borderColor: "divider", borderRadius: 2 }}>
            <Grid container spacing={1} alignItems="center">
              <Grid item xs={12} sm={3}>
                <TextField size="small" label="Clave" helperText="Identificador interno" value={campo.clave} fullWidth inputProps={{ maxLength: 60 }}
                  onChange={(e) => actualizar(idx, { clave: e.target.value.trim().replace(/\s+/g, "_") })} />
              </Grid>
              <Grid item xs={12} sm={5}>
                <TextField size="small" label="Pregunta" value={campo.etiqueta} fullWidth
                  onChange={(e) => actualizar(idx, { etiqueta: e.target.value })} />
              </Grid>
              <Grid item xs={9} sm={3}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Tipo</InputLabel>
                  <Select label="Tipo" value={campo.tipo} onChange={(e) => actualizar(idx, { tipo: e.target.value as TipoCampoFormulario })}>
                    {TIPOS_CAMPO.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={3} sm={1}>
                <IconButton size="small" color="error" aria-label="Quitar pregunta"
                  onClick={() => onChange(valor.filter((_, i) => i !== idx))}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Grid>
              {campo.tipo === "seleccion" && (
                <Grid item xs={12}>
                  <TextField size="small" label="Opciones (separadas por coma)" fullWidth value={(campo.opciones ?? []).join(", ")}
                    onChange={(e) => actualizar(idx, { opciones: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })} />
                </Grid>
              )}
              <Grid item xs={12}>
                <FormControlLabel label="Obligatorio"
                  control={<Switch size="small" checked={campo.requerido} onChange={(e) => actualizar(idx, { requerido: e.target.checked })} />} />
              </Grid>
            </Grid>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
