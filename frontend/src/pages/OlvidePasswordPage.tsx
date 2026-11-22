import { useState, type FormEvent } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Alert, Button, Link, Stack, TextField } from "@mui/material";
import AuthCard from "../components/AuthCard";
import { olvidePassword } from "../services/cuenta";
import { mensajeError } from "../utils/errors";

export default function OlvidePasswordPage() {
  const [correo, setCorreo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function enviar(e?: FormEvent) {
    e?.preventDefault();
    if (!correo.trim()) return;
    setCargando(true);
    setError(null);
    try {
      await olvidePassword({ correo: correo.trim() });
      // La API responde igual exista o no la cuenta, para no revelar qué correos están
      // registrados — el mensaje de éxito es siempre el mismo.
      setEnviado(true);
    } catch (err) {
      setError(mensajeError(err, "No se pudo enviar el enlace. Intenta de nuevo."));
    } finally {
      setCargando(false);
    }
  }

  return (
    <AuthCard
      titulo="Restablecer contraseña"
      descripcion={enviado ? undefined : "Ingresa el correo de tu cuenta y te enviaremos un enlace para elegir una nueva contraseña."}
      ancho={400}
    >
      {enviado ? (
        <Stack spacing={2}>
          <Alert severity="success">
            Si ese correo está registrado, te enviamos un enlace para restablecer tu contraseña. Revisa tu bandeja de
            entrada (y la carpeta de spam). El enlace vence en 30 minutos.
          </Alert>
          <Button component={RouterLink} to="/login" variant="outlined" fullWidth>Volver a iniciar sesión</Button>
        </Stack>
      ) : (
        <Stack component="form" spacing={2} onSubmit={enviar} noValidate>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Correo" type="email" autoComplete="email" value={correo} onChange={(e) => setCorreo(e.target.value)} fullWidth autoFocus />
          <Button type="submit" variant="contained" size="large" fullWidth disabled={!correo.trim() || cargando}>
            {cargando ? "Enviando…" : "Enviar enlace"}
          </Button>
          <Link component={RouterLink} to="/login" variant="body2" sx={{ alignSelf: "center" }}>Volver a iniciar sesión</Link>
        </Stack>
      )}
    </AuthCard>
  );
}
