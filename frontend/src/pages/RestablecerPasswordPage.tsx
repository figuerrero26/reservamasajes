import { useState } from "react";
import { Link as RouterLink, useSearchParams } from "react-router-dom";
import { Alert, Box, Button, Card, CardContent, Link, Stack, TextField, Typography } from "@mui/material";
import { restablecerPassword } from "../services/cuenta";
import { mensajeError } from "../utils/errors";

export default function RestablecerPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [listo, setListo] = useState(false);

  const formValido = password.length >= 8 && password === confirmacion;

  async function enviar() {
    if (!formValido) return;
    setCargando(true);
    setError(null);
    try {
      await restablecerPassword({ token, password_nueva: password });
      setListo(true);
    } catch (e) {
      setError(mensajeError(e, "No se pudo restablecer la contraseña."));
    } finally {
      setCargando(false);
    }
  }

  return (
    <Box sx={{ display: "flex", justifyContent: "center" }}>
      <Card sx={{ width: "100%", maxWidth: 380 }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h5" gutterBottom>Elige una nueva contraseña</Typography>

          {!token ? (
            <Alert severity="error">
              Este enlace no es válido.{" "}
              <Link component={RouterLink} to="/olvide-password">Solicita uno nuevo</Link>.
            </Alert>
          ) : listo ? (
            <Stack spacing={2}>
              <Alert severity="success">Tu contraseña quedó actualizada.</Alert>
              <Button variant="contained" fullWidth component={RouterLink} to="/login">
                Iniciar sesión
              </Button>
            </Stack>
          ) : (
            <>
              {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
              <Stack spacing={2}>
                <TextField
                  label="Nueva contraseña"
                  type="password"
                  value={password}
                  helperText="Mínimo 8 caracteres"
                  onChange={(e) => setPassword(e.target.value)}
                  fullWidth
                  autoFocus
                />
                <TextField
                  label="Confirmar contraseña"
                  type="password"
                  value={confirmacion}
                  error={confirmacion !== "" && confirmacion !== password}
                  helperText={confirmacion !== "" && confirmacion !== password ? "No coincide" : " "}
                  onChange={(e) => setConfirmacion(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && enviar()}
                  fullWidth
                />
                <Button variant="contained" fullWidth disabled={!formValido || cargando} onClick={enviar}>
                  {cargando ? "Guardando..." : "Guardar nueva contraseña"}
                </Button>
              </Stack>
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
