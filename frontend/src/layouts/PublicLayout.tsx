import { AppBar, Avatar, Box, Button, Container, Stack, Toolbar, Typography } from "@mui/material";
import SpaIcon from "@mui/icons-material/Spa";
import { Link as RouterLink, Outlet } from "react-router-dom";
import { useConfig } from "../hooks/useConfig";
import { useUsuarioAuth } from "../hooks/useUsuarioAuth";

export default function PublicLayout() {
  const config = useConfig();
  const { token, nombre, cerrarSesion } = useUsuarioAuth();

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar position="static" elevation={0}>
        <Toolbar sx={{ flexWrap: "wrap", gap: 1, py: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", flexGrow: 1 }}>
            {config.logo_url ? (
              <Avatar src={config.logo_url} variant="rounded" sx={{ mr: 1.5, width: 32, height: 32 }} />
            ) : (
              <SpaIcon sx={{ mr: 1.5 }} />
            )}
            <Box component={RouterLink} to="/" sx={{ textDecoration: "none", color: "inherit" }}>
              <Typography variant="h6" lineHeight={1.2}>{config.sistema_nombre}</Typography>
              {config.empresa_nombre && (
                <Typography variant="caption" sx={{ opacity: 0.85 }}>{config.empresa_nombre}</Typography>
              )}
            </Box>
          </Box>

          <Stack direction="row" spacing={1} alignItems="center">
            {token ? (
              <>
                <Typography variant="body2" sx={{ display: { xs: "none", sm: "block" }, opacity: 0.9 }}>
                  Hola, {nombre}
                </Typography>
                <Button color="inherit" component={RouterLink} to="/mis-reservas">
                  Mis reservas
                </Button>
                <Button color="inherit" variant="outlined" onClick={cerrarSesion}>
                  Salir
                </Button>
              </>
            ) : (
              <>
                <Button color="inherit" component={RouterLink} to="/login">
                  Iniciar sesión
                </Button>
                <Button color="inherit" variant="outlined" component={RouterLink} to="/registro">
                  Registrarse
                </Button>
              </>
            )}
          </Stack>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 4 }, px: { xs: 2, sm: 3 } }}>
        <Outlet />
      </Container>
    </Box>
  );
}
