import { useState, type FormEvent } from "react";
import { Link as RouterLink, useSearchParams } from "react-router-dom";
import { Alert, Button, Link, Stack, TextField } from "@mui/material";
import AuthCard from "../components/AuthCard";
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

  const noCoincide = confirmacion !== "" && confirmacion !== password;
  const formValido = password.length >= 8 && password === confirmacion;

  async function enviar(e?: FormEvent) {
    e?.preventDefault();
    if (!formValido) return;
    setCargando(true);
    setError(null);
    try {
      await restablecerPassword({ token, password_nueva: password });
      setListo(true);
    } catch (err) {
      setError(mensajeError(err, "No se pudo restablecer la contraseña."));
    } finally {
      setCargando(false);
    }
  }

  return (
    <AuthCard titulo="Elige una nueva contraseña" ancho={400}>
      {!token ? (
        <Alert severity="error">
          Este enlace no es válido. <Link component={RouterLink} to="/olvide-password">Solicita uno nuevo</Link>.
        </Alert>
      ) : listo ? (
        <Stack spacing={2}>
          <Alert severity="success">Tu contraseña quedó actualizada.</Alert>
          <Button variant="contained" size="large" fullWidth component={RouterLink} to="/login">Iniciar sesión</Button>
        </Stack>
      ) : (
        <Stack component="form" spacing={2} onSubmit={enviar} noValidate>
          {error && (
            <Alert severity="error">
              {error} <Link component={RouterLink} to="/olvide-password">Solicitar otro enlace</Link>
            </Alert>
          )}
          <TextField
            label="Nueva contraseña"
            type="password"
            autoComplete="new-password"
            value={password}
            helperText="Mínimo 8 caracteres"
            onChange={(e) => setPassword(e.target.value)}
            inputProps={{ maxLength: 72 }}
            fullWidth
            autoFocus
          />
          <TextField
            label="Confirmar contraseña"
            type="password"
            autoComplete="new-password"
            value={confirmacion}
            error={noCoincide}
            helperText={noCoincide ? "No coincide" : " "}
            onChange={(e) => setConfirmacion(e.target.value)}
            fullWidth
          />
          <Button type="submit" variant="contained" size="large" fullWidth disabled={!formValido || cargando}>
            {cargando ? "Guardando…" : "Guardar nueva contraseña"}
          </Button>
        </Stack>
      )}
    </AuthCard>
  );
}
