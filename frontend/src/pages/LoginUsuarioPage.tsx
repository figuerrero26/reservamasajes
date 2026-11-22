import { useState, type FormEvent } from "react";
import { Link as RouterLink, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Button, Link, Stack, TextField, Typography } from "@mui/material";
import AuthCard, { destinoSeguro } from "../components/AuthCard";
import { iniciarSesionUsuario } from "../services/cuenta";
import { mensajeError } from "../utils/errors";
import { useUsuarioAuth } from "../hooks/useUsuarioAuth";

export default function LoginUsuarioPage() {
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const { token, iniciarSesion } = useUsuarioAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = destinoSeguro(params.get("next"));

  if (token) return <Navigate to={next} replace />;

  async function enviar(e?: FormEvent) {
    e?.preventDefault();
    if (!correo.trim() || !password) return;
    setCargando(true);
    setError(null);
    try {
      const r = await iniciarSesionUsuario({ correo: correo.trim(), password });
      iniciarSesion(r.access_token, r.nombre, r.correo);
      navigate(next, { replace: true });
    } catch (err) {
      setError(mensajeError(err, "Credenciales inválidas."));
    } finally {
      setCargando(false);
    }
  }

  return (
    <AuthCard titulo="Iniciar sesión" descripcion="Ingresa con el correo de tu cuenta de colaborador." ancho={400}>
      <Stack component="form" spacing={2} onSubmit={enviar} noValidate>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField label="Correo" type="email" autoComplete="email" value={correo} onChange={(e) => setCorreo(e.target.value)} fullWidth autoFocus />
        <TextField
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          fullWidth
        />
        <Button type="submit" variant="contained" size="large" fullWidth disabled={!correo.trim() || !password || cargando}>
          {cargando ? "Ingresando…" : "Ingresar"}
        </Button>
        <Link component={RouterLink} to="/olvide-password" variant="body2" sx={{ alignSelf: "center" }}>
          ¿Olvidaste tu contraseña?
        </Link>
        <Typography variant="body2" align="center" color="text.secondary">
          ¿No tienes cuenta?{" "}
          <Link component={RouterLink} to={`/registro?next=${encodeURIComponent(next)}`}>Regístrate</Link>
        </Typography>
      </Stack>
    </AuthCard>
  );
}
