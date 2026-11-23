import { useState } from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from "@mui/material";
import { useAuth } from "../../hooks/useAuth";
import { cambiarPassword } from "../../services/auth";
import { mensajeError } from "../../utils/errors";
import PasswordNuevaCampos, { PASSWORD_VACIA, passwordNuevaLista, type PasswordNueva } from "./PasswordNuevaCampos";

/** Cambio de la contraseña PROPIA (exige la actual). El backend responde con una sesión
 * nueva: se guarda para seguir trabajando, y las demás sesiones abiertas de la cuenta se
 * cierran. Lo usan el menú del panel y la fila de la cuenta propia en «Administradores». */
export default function CambiarPasswordPropiaDialog({ abierto, onCerrar, usuario }: {
  abierto: boolean;
  onCerrar: () => void;
  /** Usuario de la cuenta (si se conoce): la contraseña nueva no puede contenerlo. */
  usuario?: string | null;
}) {
  const { nombre, iniciarSesion } = useAuth();
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState<PasswordNueva>(PASSWORD_VACIA);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);

  function cerrar() {
    setActual("");
    setNueva(PASSWORD_VACIA);
    setError(null);
    setExito(false);
    onCerrar();
  }

  const lista = !!actual && passwordNuevaLista(nueva, { usuario, nombre });

  async function enviar() {
    if (!lista) return;
    setEnviando(true);
    setError(null);
    try {
      const sesion = await cambiarPassword(actual, nueva.nueva, nueva.confirmacion);
      iniciarSesion(sesion.access_token, sesion.nombre, sesion.rol);
      setExito(true);
      setActual("");
      setNueva(PASSWORD_VACIA);
    } catch (e) {
      setError(mensajeError(e, "No se pudo cambiar la contraseña."));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={abierto} onClose={() => !enviando && cerrar()} maxWidth="xs" fullWidth>
      <DialogTitle>Cambiar mi contraseña</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {exito ? (
            <Alert severity="success">
              Contraseña actualizada. Esta sesión sigue abierta; las demás sesiones de tu cuenta se cerraron.
            </Alert>
          ) : (
            <>
              <TextField
                label="Contraseña actual"
                type="password"
                autoComplete="current-password"
                value={actual}
                onChange={(e) => setActual(e.target.value)}
                fullWidth
                autoFocus
              />
              <PasswordNuevaCampos valor={nueva} onChange={setNueva} usuario={usuario} nombre={nombre} />
            </>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={cerrar} disabled={enviando}>
          {exito ? "Listo" : "Cancelar"}
        </Button>
        {!exito && (
          <Button variant="contained" onClick={enviar} disabled={enviando || !lista}>
            {enviando ? "Guardando…" : "Guardar"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
