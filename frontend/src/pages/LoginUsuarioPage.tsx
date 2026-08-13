import { useState } from "react";
import { Link as RouterLink, useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Box, Button, Card, CardContent, Link, Stack, TextField, Typography } from "@mui/material";
import { iniciarSesionUsuario } from "../services/cuenta";
import { mensajeError } from "../utils/errors";
import { useUsuarioAuth } from "../hooks/useUsuarioAuth";

export default function LoginUsuarioPage() {
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const { iniciarSesion } = useUsuarioAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/";

  async function enviar() {
    if (!correo.trim() || !password) return;
    setCargando(true);
    setError(null);
    try {
      const r = await iniciarSesionUsuario({ correo: correo.trim(), password });
      iniciarSesion(r.access_token, r.nombre, r.correo);
      navigate(next);
    } catch (e) {
      setError(mensajeError(e, "Credenciales inválidas."));
    } finally {
      setCargando(false);
    }
  }

  return (
    <Box sx={{ display: "flex", justifyContent: "center" }}>
      <Card sx={{ width: "100%", maxWidth: 380 }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h5" gutterBottom>Iniciar sesión</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Ingresa con el correo de tu cuenta de colaborador.
          </Typography>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <Stack spacing={2}>
            <TextField label="Correo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} fullWidth autoFocus />
            <TextField
              label="Contraseña"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && enviar()}
              fullWidth
            />
            <Button variant="contained" fullWidth disabled={!correo.trim() || !password || cargando} onClick={enviar}>
              {cargando ? "Ingresando..." : "Ingresar"}
            </Button>
            <Typography variant="body2" align="center">
              ¿No tienes cuenta?{" "}
              <Link component={RouterLink} to={`/registro?next=${encodeURIComponent(next)}`}>
                Regístrate
              </Link>
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
