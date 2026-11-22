import { useState, type FormEvent } from "react";
import { Link as RouterLink, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Button, Link, Stack, TextField, Typography } from "@mui/material";
import AuthCard, { destinoSeguro } from "../components/AuthCard";
import { registrarse } from "../services/cuenta";
import { mensajeError } from "../utils/errors";
import { useUsuarioAuth } from "../hooks/useUsuarioAuth";

const CORREO_VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function RegistroPage() {
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [tocado, setTocado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const { token, iniciarSesion } = useUsuarioAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = destinoSeguro(params.get("next"));

  if (token) return <Navigate to={next} replace />;

  const correoValido = CORREO_VALIDO.test(correo.trim());
  const formValido = nombre.trim() && apellido.trim() && correoValido && password.length >= 8;

  async function enviar(e?: FormEvent) {
    e?.preventDefault();
    setTocado(true);
    if (!formValido) return;
    setCargando(true);
    setError(null);
    try {
      const r = await registrarse({ nombre: nombre.trim(), apellido: apellido.trim(), correo: correo.trim(), password });
      iniciarSesion(r.access_token, r.nombre, r.correo);
      navigate(next, { replace: true });
    } catch (err) {
      setError(mensajeError(err, "No se pudo crear la cuenta."));
    } finally {
      setCargando(false);
    }
  }

  return (
    <AuthCard titulo="Crear cuenta" descripcion="Solo necesitas tu nombre, tu correo y una contraseña para empezar a reservar.">
      <Stack component="form" spacing={2} onSubmit={enviar} noValidate>
        {error && <Alert severity="error">{error}</Alert>}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField label="Nombre" autoComplete="given-name" value={nombre} onChange={(e) => setNombre(e.target.value)} fullWidth
            error={tocado && !nombre.trim()} inputProps={{ maxLength: 120 }} />
          <TextField label="Apellido" autoComplete="family-name" value={apellido} onChange={(e) => setApellido(e.target.value)} fullWidth
            error={tocado && !apellido.trim()} inputProps={{ maxLength: 120 }} />
        </Stack>
        <TextField
          label="Correo"
          type="email"
          autoComplete="email"
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          error={tocado && !correoValido}
          helperText={tocado && !correoValido ? "Ingresa un correo válido" : undefined}
          fullWidth
        />
        <TextField
          label="Contraseña"
          type="password"
          autoComplete="new-password"
          value={password}
          error={tocado && password.length < 8}
          helperText="Mínimo 8 caracteres"
          onChange={(e) => setPassword(e.target.value)}
          inputProps={{ maxLength: 72 }}
          fullWidth
        />
        <Button type="submit" variant="contained" size="large" fullWidth disabled={cargando}>
          {cargando ? "Creando cuenta…" : "Crear cuenta"}
        </Button>
        <Typography variant="caption" color="text.secondary" align="center">
          Al registrarte aceptas los <Link component={RouterLink} to="/terminos">términos</Link> y la{" "}
          <Link component={RouterLink} to="/privacidad">política de privacidad</Link>.
        </Typography>
        <Typography variant="body2" align="center" color="text.secondary">
          ¿Ya tienes cuenta?{" "}
          <Link component={RouterLink} to={`/login?next=${encodeURIComponent(next)}`}>Inicia sesión</Link>
        </Typography>
      </Stack>
    </AuthCard>
  );
}
