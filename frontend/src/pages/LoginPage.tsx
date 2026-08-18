import { useState } from "react";
import {
  Alert, Box, Button, Card, CardContent, TextField, Typography,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { login } from "../services/auth";
import { useAuth } from "../hooks/useAuth";

export default function LoginPage() {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const { iniciarSesion } = useAuth();
  const navigate = useNavigate();

  async function enviar() {
    setCargando(true);
    setError(null);
    try {
      const r = await login(usuario.trim(), password);
      iniciarSesion(r.access_token, r.nombre, r.rol);
      navigate(r.rol === "administrador" ? "/admin" : "/admin/reservas");
    } catch {
      setError("Credenciales inválidas");
    } finally {
      setCargando(false);
    }
  }

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "background.default", p: 2 }}>
      <Card sx={{ width: 380 }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h5" gutterBottom>Administración</Typography>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <TextField fullWidth label="Usuario" value={usuario} onChange={(e) => setUsuario(e.target.value)} sx={{ mb: 2 }} />
          <TextField fullWidth type="password" label="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} sx={{ mb: 3 }} onKeyDown={(e) => e.key === "Enter" && enviar()} />
          <Button fullWidth variant="contained" disabled={cargando} onClick={enviar}>Ingresar</Button>
        </CardContent>
      </Card>
    </Box>
  );
}
