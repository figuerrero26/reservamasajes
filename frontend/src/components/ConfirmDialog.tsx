import type { ReactNode } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";

interface ConfirmDialogProps {
  abierto: boolean;
  titulo: string;
  contenido?: ReactNode;
  textoConfirmar?: string;
  colorConfirmar?: "primary" | "error" | "warning" | "success";
  cargando?: boolean;
  error?: string | null;
  onConfirmar: () => void;
  onCancelar: () => void;
}

/** Diálogo de confirmación reutilizable para acciones como cancelar/eliminar/desactivar. */
export default function ConfirmDialog({
  abierto,
  titulo,
  contenido,
  textoConfirmar = "Confirmar",
  colorConfirmar = "primary",
  cargando = false,
  error,
  onConfirmar,
  onCancelar,
}: ConfirmDialogProps) {
  return (
    <Dialog open={abierto} onClose={onCancelar} maxWidth="xs" fullWidth>
      <DialogTitle>{titulo}</DialogTitle>
      <DialogContent>
        {contenido && <DialogContentText component="div">{contenido}</DialogContentText>}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancelar} disabled={cargando}>
          Volver
        </Button>
        <Button onClick={onConfirmar} color={colorConfirmar} variant="contained" disabled={cargando}>
          {textoConfirmar}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
