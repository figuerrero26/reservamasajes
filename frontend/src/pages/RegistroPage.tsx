import { useState } from "react";
import { Link as RouterLink, useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Box, Button, Card, CardContent, Link, Stack, TextField, Typography } from "@mui/material";
import { registrarse } from "../services/cuenta";
import { mensajeError } from "../utils/errors";
import { useUsuarioAuth } from "../hooks/useUsuarioAuth";

export default function RegistroPage() {
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const { iniciarSesion } = useUsuarioAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/";

  const formValido = nombre.trim() && apellido.trim() && correo.trim() && password.length >= 8;

  async function enviar() {
    if (!formValido) return;
    setCargando(true);
    setError(null);
    try {
      const r = await registrarse({
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        correo: correo.trim(),
        password,
      });
      iniciarSesion(r.access_token, r.nombre, r.correo);
      navigate(next);
    } catch (e) {
      setError(mensajeError(e, "No se pudo crear la cuenta."));
    } finally {
      setCargando(false);
    }
  }

  return (
    <Box sx={{ display: "flex", justifyContent: "center" }}>
      <Card sx={{ width: "100%", maxWidth: 420 }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h5" gutterBottom>Crear cuenta</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Regístrate con tu nombre, correo y una contraseña para poder reservar.
          </Typography>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <Stack spacing={2}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} fullWidth />
              <TextField label="Apellido" value={apellido} onChange={(e) => setApellido(e.target.value)} fullWidth />
            </Stack>
            <TextField label="Correo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} fullWidth />
            <TextField
              label="Contraseña"
              type="password"
              value={password}
              helperText="Mínimo 8 caracteres"
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && enviar()}
              fullWidth
            />
            <Button variant="contained" fullWidth disabled={!formValido || cargando} onClick={enviar}>
              {cargando ? "Creando cuenta..." : "Crear cuenta"}
            </Button>
            <Typography variant="body2" align="center">
              ¿Ya tienes cuenta?{" "}
              <Link component={RouterLink} to={`/login?next=${encodeURIComponent(next)}`}>
                Inicia sesión
              </Link>
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
