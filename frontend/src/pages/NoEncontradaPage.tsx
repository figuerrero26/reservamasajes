import { Button } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import EmptyState from "../components/EmptyState";

/** Ruta desconocida: antes se mostraba una página en blanco dentro del layout público. */
export default function NoEncontradaPage() {
  return (
    <EmptyState
      titulo="No encontramos esta página"
      descripcion="Es posible que el enlace haya cambiado o que la página ya no exista."
      accion={<Button component={RouterLink} to="/" variant="contained">Volver al inicio</Button>}
    />
  );
}
