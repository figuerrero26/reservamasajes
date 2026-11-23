import { useState } from "react";
import { Box, Button, IconButton, InputAdornment, Stack, TextField, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import { generarPasswordSegura, requisitosPassword } from "../../utils/password";

export interface PasswordNueva {
  nueva: string;
  confirmacion: string;
}

export const PASSWORD_VACIA: PasswordNueva = { nueva: "", confirmacion: "" };

interface Props {
  valor: PasswordNueva;
  onChange: (v: PasswordNueva) => void;
  /** Usuario y nombre de la cuenta: la contraseña no puede contenerlos. */
  usuario?: string | null;
  nombre?: string | null;
  autoFocus?: boolean;
}

/** Nueva contraseña + confirmación, con la lista de requisitos en vivo, opción de ver lo
 * escrito y generador de contraseñas seguras. La validación definitiva la hace el backend. */
export default function PasswordNuevaCampos({ valor, onChange, usuario, nombre, autoFocus }: Props) {
  const [visible, setVisible] = useState(false);
  const requisitos = requisitosPassword(valor.nueva, { usuario, nombre });
  const noCoincide = valor.confirmacion.length > 0 && valor.confirmacion !== valor.nueva;

  const ojo = (
    <InputAdornment position="end">
      <IconButton
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        onClick={() => setVisible((v) => !v)}
        edge="end"
      >
        {visible ? <VisibilityOffIcon /> : <VisibilityIcon />}
      </IconButton>
    </InputAdornment>
  );

  return (
    <Stack spacing={2}>
      <TextField
        label="Nueva contraseña"
        type={visible ? "text" : "password"}
        autoComplete="new-password"
        value={valor.nueva}
        onChange={(e) => onChange({ ...valor, nueva: e.target.value })}
        fullWidth
        autoFocus={autoFocus}
        InputProps={{ endAdornment: ojo }}
      />
      <TextField
        label="Confirmar nueva contraseña"
        type={visible ? "text" : "password"}
        autoComplete="new-password"
        value={valor.confirmacion}
        onChange={(e) => onChange({ ...valor, confirmacion: e.target.value })}
        error={noCoincide}
        helperText={noCoincide ? "No coincide con la nueva contraseña" : " "}
        fullWidth
      />
      <Box>
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" useFlexGap spacing={1} sx={{ mb: 0.75 }}>
          <Typography variant="caption" color="text.secondary">La contraseña debe tener:</Typography>
          <Button
            size="small"
            startIcon={<AutorenewIcon />}
            onClick={() => {
              const generada = generarPasswordSegura();
              setVisible(true);
              onChange({ nueva: generada, confirmacion: generada });
            }}
          >
            Generar una segura
          </Button>
        </Stack>
        <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 0.5 }}>
          {requisitos.map((r) => (
            <Box component="li" key={r.clave} sx={{ display: "flex", alignItems: "center", gap: 0.75, color: r.cumple ? "success.main" : "text.secondary" }}>
              {r.cumple ? <CheckCircleIcon sx={{ fontSize: 16 }} /> : <RadioButtonUncheckedIcon sx={{ fontSize: 16 }} />}
              <Typography variant="caption" color="inherit">{r.texto}</Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Stack>
  );
}

/** ¿Se puede enviar? (requisitos cumplidos y confirmación igual). */
export function passwordNuevaLista(v: PasswordNueva, datos: { usuario?: string | null; nombre?: string | null } = {}): boolean {
  return v.nueva.length > 0 && v.nueva === v.confirmacion && requisitosPassword(v.nueva, datos).every((r) => r.cumple);
}
