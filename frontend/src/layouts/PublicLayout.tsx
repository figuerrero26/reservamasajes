import { useState } from "react";
import {
  AppBar, Box, Button, Container, Divider, Drawer, IconButton, List, ListItemButton, ListItemText, Stack,
  Toolbar, Typography, useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import MenuIcon from "@mui/icons-material/Menu";
import CloseIcon from "@mui/icons-material/Close";
import SpaIcon from "@mui/icons-material/Spa";
import { Link as RouterLink, Outlet, useLocation } from "react-router-dom";
import { useConfig } from "../hooks/useConfig";
import { useUsuarioAuth } from "../hooks/useUsuarioAuth";
import Footer from "../components/Footer";
import { NEGRO, textoGrandeSobre, textoLegibleSobre } from "../theme";

interface Enlace {
  texto: string;
  ruta: string;
}

/** "Vive la Semana Sigra Vive | Reserva un espacio" → título y lema en dos líneas, para que
 * el nombre completo quepa también en móvil sin cortarse. */
function partirNombre(nombre: string | null | undefined): [string, string | null] {
  const [titulo, ...resto] = (nombre || "").split("|").map((p) => p.trim());
  return [titulo, resto.join(" | ") || null];
}

export default function PublicLayout() {
  const config = useConfig();
  const theme = useTheme();
  const { token, nombre, cerrarSesion } = useUsuarioAuth();
  const { pathname } = useLocation();
  const [menuAbierto, setMenuAbierto] = useState(false);

  // Menú verde de marca con contraste calculado: títulos e íconos grandes en blanco y textos
  // pequeños en negro (el que mejor se lee sobre el verde), con el botón principal en negro.
  const verde = theme.palette.primary.main;
  const textoGrande = textoGrandeSobre(verde);
  const textoChico = textoLegibleSobre(verde);
  const [titulo, lema] = partirNombre(config.sistema_nombre);

  const enlaces: Enlace[] = token
    ? [
        { texto: "Inicio", ruta: "/" },
        { texto: "Mis reservas", ruta: "/mis-reservas" },
        { texto: "Mis inscripciones", ruta: "/mis-inscripciones" },
      ]
    : [{ texto: "Inicio", ruta: "/" }];

  const activo = (ruta: string) => (ruta === "/" ? pathname === "/" : pathname.startsWith(ruta));

  const botonOscuro = {
    bgcolor: NEGRO, color: "#FFFFFF",
    "&:hover": { bgcolor: "#000000" },
  };

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column", bgcolor: "background.default" }}>
      <AppBar
        position="sticky"
        sx={{ bgcolor: verde, color: textoChico, backdropFilter: "none", borderBottom: `1px solid ${alpha(NEGRO, 0.12)}` }}
      >
        <Container maxWidth="lg" disableGutters sx={{ px: { xs: 2, sm: 3 } }}>
          <Toolbar disableGutters sx={{ minHeight: { xs: 64, sm: 72 }, gap: 2 }}>
            <Box
              component={RouterLink}
              to="/"
              sx={{ display: "flex", alignItems: "center", gap: 1.5, textDecoration: "none", flexGrow: 1, minWidth: 0 }}
            >
              {config.logo_url ? (
                <Box component="img" src={config.logo_url} alt="" sx={{ height: { xs: 34, sm: 40 }, maxWidth: 120, objectFit: "contain", flexShrink: 0 }} />
              ) : (
                <SpaIcon sx={{ color: textoGrande, flexShrink: 0 }} />
              )}
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  component="span"
                  sx={{ display: "block", color: textoGrande, fontWeight: 700, fontSize: { xs: "1rem", sm: "1.2rem" }, lineHeight: 1.2, letterSpacing: "-0.01em" }}
                  noWrap
                >
                  {titulo}
                </Typography>
                {lema && (
                  <Typography component="span" sx={{ display: "block", color: textoChico, fontSize: { xs: "0.75rem", sm: "0.82rem" }, fontWeight: 600, lineHeight: 1.3 }} noWrap>
                    {lema}
                  </Typography>
                )}
              </Box>
            </Box>

            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ display: { xs: "none", md: "flex" } }}>
              {enlaces.map((e) => (
                <Button
                  key={e.ruta}
                  component={RouterLink}
                  to={e.ruta}
                  sx={{
                    fontWeight: 600, px: 1.75,
                    ...(activo(e.ruta)
                      ? { bgcolor: alpha("#FFFFFF", 0.92), color: NEGRO, "&:hover": { bgcolor: "#FFFFFF" } }
                      : { color: textoChico, "&:hover": { bgcolor: alpha(NEGRO, 0.08) } }),
                  }}
                >
                  {e.texto}
                </Button>
              ))}
              <Divider orientation="vertical" flexItem sx={{ mx: 1, my: 1.75, borderColor: alpha(textoChico, 0.25) }} />
              {token ? (
                <>
                  <Typography variant="body2" sx={{ px: 1, color: textoChico, fontWeight: 500 }} noWrap>
                    Hola, {nombre}
                  </Typography>
                  <Button
                    variant="outlined"
                    onClick={cerrarSesion}
                    sx={{ color: textoChico, borderColor: alpha(textoChico, 0.55), "&:hover": { borderColor: textoChico, bgcolor: alpha(NEGRO, 0.06) } }}
                  >
                    Salir
                  </Button>
                </>
              ) : (
                <>
                  <Button component={RouterLink} to="/login" sx={{ color: textoChico, fontWeight: 600, "&:hover": { bgcolor: alpha(NEGRO, 0.08) } }}>
                    Iniciar sesión
                  </Button>
                  <Button component={RouterLink} to="/registro" variant="contained" sx={botonOscuro}>
                    Crear cuenta
                  </Button>
                </>
              )}
            </Stack>

            <IconButton
              aria-label="Abrir menú"
              onClick={() => setMenuAbierto(true)}
              sx={{ display: { xs: "inline-flex", md: "none" }, color: textoGrande, "&:hover": { bgcolor: alpha(NEGRO, 0.08) } }}
            >
              <MenuIcon />
            </IconButton>
          </Toolbar>
        </Container>
      </AppBar>

      <Drawer anchor="right" open={menuAbierto} onClose={() => setMenuAbierto(false)}>
        <Box sx={{ width: 290 }} role="presentation">
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2, py: 1.5, bgcolor: verde }}>
            <Typography sx={{ fontWeight: 700, color: textoGrande }}>Menú</Typography>
            <IconButton aria-label="Cerrar menú" onClick={() => setMenuAbierto(false)} sx={{ color: textoGrande }}>
              <CloseIcon />
            </IconButton>
          </Stack>
          <Box sx={{ p: 2 }}>
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
                  <ListItemText primary={e.texto} primaryTypographyProps={{ fontWeight: 600 }} />
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
                  <Button component={RouterLink} to="/registro" variant="contained" sx={botonOscuro} onClick={() => setMenuAbierto(false)}>
                    Crear cuenta
                  </Button>
                  <Button component={RouterLink} to="/login" variant="outlined" color="inherit" onClick={() => setMenuAbierto(false)}>
                    Iniciar sesión
                  </Button>
                </>
              )}
            </Stack>
          </Box>
        </Box>
      </Drawer>

      <Container component="main" maxWidth="lg" sx={{ flexGrow: 1, py: { xs: 3, sm: 6 }, px: { xs: 2, sm: 3 } }}>
        <Outlet />
      </Container>
      <Footer />
    </Box>
  );
}
