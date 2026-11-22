import { useState, type FormEvent } from "react";
import { Alert, Box, Button, Stack, TextField, Typography } from "@mui/material";
import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
import { Navigate, useNavigate } from "react-router-dom";
import AuthCard from "../components/AuthCard";
import { login } from "../services/auth";
import { useAuth } from "../hooks/useAuth";
import { mensajeError } from "../utils/errors";
import { ROL_ADMINISTRADOR } from "../constants/roles";

export default function LoginPage() {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const { token, rol, iniciarSesion } = useAuth();
  const navigate = useNavigate();

  if (token) return <Navigate to={rol === ROL_ADMINISTRADOR ? "/admin" : "/admin/reservas"} replace />;

  async function enviar(e?: FormEvent) {
    e?.preventDefault();
    if (!usuario.trim() || !password) return;
    setCargando(true);
    setError(null);
    try {
      const r = await login(usuario.trim(), password);
      iniciarSesion(r.access_token, r.nombre, r.rol);
      navigate(r.rol === ROL_ADMINISTRADOR ? "/admin" : "/admin/reservas", { replace: true });
    } catch (err) {
      // Distingue credenciales inválidas de servidor caído o demasiados intentos.
      setError(mensajeError(err, "Credenciales inválidas"));
    } finally {
      setCargando(false);
    }
  }

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "background.default", p: 2 }}>
      <Box sx={{ width: "100%" }}>
        <Stack alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <AdminPanelSettingsOutlinedIcon color="primary" sx={{ fontSize: 36 }} />
          <Typography variant="overline" color="text.secondary">Panel de administración</Typography>
        </Stack>
        <AuthCard titulo="Ingresar" ancho={400}>
          <Stack component="form" spacing={2} onSubmit={enviar} noValidate>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField fullWidth label="Usuario" autoComplete="username" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoFocus />
            <TextField fullWidth type="password" label="Contraseña" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button type="submit" fullWidth size="large" variant="contained" disabled={cargando || !usuario.trim() || !password}>
              {cargando ? "Ingresando…" : "Ingresar"}
            </Button>
          </Stack>
        </AuthCard>
      </Box>
    </Box>
  );
}
