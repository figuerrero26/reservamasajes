import { useState } from "react";
import {
  AppBar, Box, Button, Container, Divider, Drawer, IconButton, List, ListItemButton, ListItemText, Stack,
  Toolbar, Typography,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import CloseIcon from "@mui/icons-material/Close";
import SpaIcon from "@mui/icons-material/Spa";
import { Link as RouterLink, Outlet, useLocation } from "react-router-dom";
import { useConfig } from "../hooks/useConfig";
import { useUsuarioAuth } from "../hooks/useUsuarioAuth";
import Footer from "../components/Footer";

interface Enlace {
  texto: string;
  ruta: string;
}

export default function PublicLayout() {
  const config = useConfig();
  const { token, nombre, cerrarSesion } = useUsuarioAuth();
  const { pathname } = useLocation();
  const [menuAbierto, setMenuAbierto] = useState(false);

  const enlaces: Enlace[] = token
    ? [
        { texto: "Inicio", ruta: "/" },
        { texto: "Mis reservas", ruta: "/mis-reservas" },
        { texto: "Mis inscripciones", ruta: "/mis-inscripciones" },
      ]
    : [{ texto: "Inicio", ruta: "/" }];

  const activo = (ruta: string) => (ruta === "/" ? pathname === "/" : pathname.startsWith(ruta));

  const marca = (
    <Box
      component={RouterLink}
      to="/"
      sx={{ display: "flex", alignItems: "center", gap: 1.25, textDecoration: "none", color: "inherit", minWidth: 0 }}
    >
      {config.logo_url ? (
        <Box component="img" src={config.logo_url} alt="" sx={{ height: 32, maxWidth: 140, objectFit: "contain" }} />
      ) : (
        <SpaIcon color="primary" />
      )}
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.15 }} noWrap>
          {config.sistema_nombre}
        </Typography>
        {config.empresa_nombre && (
          <Typography variant="caption" color="text.secondary" sx={{ display: { xs: "none", sm: "block" }, lineHeight: 1.2 }} noWrap>
            {config.empresa_nombre}
          </Typography>
        )}
      </Box>
    </Box>
  );

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column", bgcolor: "background.default" }}>
      <AppBar position="sticky">
        <Container maxWidth="lg" disableGutters sx={{ px: { xs: 2, sm: 3 } }}>
          <Toolbar disableGutters sx={{ minHeight: { xs: 60, sm: 68 }, gap: 2 }}>
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>{marca}</Box>

            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ display: { xs: "none", md: "flex" } }}>
              {enlaces.map((e) => (
                <Button
                  key={e.ruta}
                  component={RouterLink}
                  to={e.ruta}
                  color="inherit"
                  sx={{ fontWeight: activo(e.ruta) ? 700 : 500, opacity: activo(e.ruta) ? 1 : 0.75 }}
                >
                  {e.texto}
                </Button>
              ))}
              <Divider orientation="vertical" flexItem sx={{ mx: 1, my: 1.5 }} />
              {token ? (
                <>
                  <Typography variant="body2" color="text.secondary" sx={{ px: 1 }} noWrap>
                    Hola, {nombre}
                  </Typography>
                  <Button variant="outlined" color="inherit" onClick={cerrarSesion}>
                    Salir
                  </Button>
                </>
              ) : (
                <>
                  <Button component={RouterLink} to="/login" color="inherit">
                    Iniciar sesión
                  </Button>
                  <Button component={RouterLink} to="/registro" variant="contained">
                    Crear cuenta
                  </Button>
                </>
              )}
            </Stack>

            <IconButton
              aria-label="Abrir menú"
              onClick={() => setMenuAbierto(true)}
              sx={{ display: { xs: "inline-flex", md: "none" } }}
            >
              <MenuIcon />
            </IconButton>
          </Toolbar>
        </Container>
      </AppBar>

      <Drawer anchor="right" open={menuAbierto} onClose={() => setMenuAbierto(false)}>
        <Box sx={{ width: 280, p: 2 }} role="presentation">
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Menú</Typography>
            <IconButton aria-label="Cerrar menú" onClick={() => setMenuAbierto(false)}>
              <CloseIcon />
            </IconButton>
          </Stack>
          {token && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1, px: 1 }}>
              Hola, {nombre}
            </Typography>
          )}
          <List disablePadding>
            {enlaces.map((e) => (
              <ListItemButton
                key={e.ruta}
                component={RouterLink}
                to={e.ruta}
                selected={activo(e.ruta)}
                onClick={() => setMenuAbierto(false)}
              >
                <ListItemText primary={e.texto} />
              </ListItemButton>
            ))}
          </List>
          <Divider sx={{ my: 2 }} />
          <Stack spacing={1}>
            {token ? (
              <Button variant="outlined" color="inherit" onClick={() => { cerrarSesion(); setMenuAbierto(false); }}>
                Cerrar sesión
              </Button>
            ) : (
              <>
                <Button component={RouterLink} to="/registro" variant="contained" onClick={() => setMenuAbierto(false)}>
                  Crear cuenta
                </Button>
                <Button component={RouterLink} to="/login" variant="outlined" color="inherit" onClick={() => setMenuAbierto(false)}>
                  Iniciar sesión
                </Button>
              </>
            )}
          </Stack>
        </Box>
      </Drawer>

      <Container component="main" maxWidth="lg" sx={{ flexGrow: 1, py: { xs: 3, sm: 6 }, px: { xs: 2, sm: 3 } }}>
        <Outlet />
      </Container>
      <Footer />
    </Box>
  );
}
