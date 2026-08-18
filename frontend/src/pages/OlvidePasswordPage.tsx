import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Alert, Box, Button, Card, CardContent, Link, Stack, TextField, Typography } from "@mui/material";
import { olvidePassword } from "../services/cuenta";
import { mensajeError } from "../utils/errors";

export default function OlvidePasswordPage() {
  const [correo, setCorreo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function enviar() {
    if (!correo.trim()) return;
    setCargando(true);
    setError(null);
    try {
      await olvidePassword({ correo: correo.trim() });
      // La API responde igual exista o no la cuenta, para no revelar qué correos están
      // registrados — el mensaje de éxito es siempre el mismo.
      setEnviado(true);
    } catch (e) {
      setError(mensajeError(e, "No se pudo enviar el enlace. Intenta de nuevo."));
    } finally {
      setCargando(false);
    }
  }

  return (
    <Box sx={{ display: "flex", justifyContent: "center" }}>
      <Card sx={{ width: "100%", maxWidth: 380 }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h5" gutterBottom>Restablecer contraseña</Typography>

          {enviado ? (
            <Stack spacing={2}>
              <Alert severity="success">
                Si ese correo está registrado, te enviamos un enlace para restablecer tu contraseña. Revisa tu
                bandeja de entrada (y la carpeta de spam).
              </Alert>
              <Typography variant="body2" align="center">
                <Link component={RouterLink} to="/login">Volver a iniciar sesión</Link>
              </Typography>
            </Stack>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Ingresa el correo de tu cuenta y te enviaremos un enlace para elegir una nueva contraseña.
              </Typography>

              {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

              <Stack spacing={2}>
                <TextField
                  label="Correo"
                  type="email"
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && enviar()}
                  fullWidth
                  autoFocus
                />
                <Button variant="contained" fullWidth disabled={!correo.trim() || cargando} onClick={enviar}>
                  {cargando ? "Enviando..." : "Enviar enlace"}
                </Button>
                <Typography variant="body2" align="center">
                  <Link component={RouterLink} to="/login">Volver a iniciar sesión</Link>
                </Typography>
              </Stack>
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
