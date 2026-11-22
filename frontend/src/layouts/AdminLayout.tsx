import { useEffect, useState } from "react";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  TextField,
  Toolbar,
  Typography,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import LockResetIcon from "@mui/icons-material/LockReset";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useConfig } from "../hooks/useConfig";
import { cambiarPassword } from "../services/auth";
import { mensajeError } from "../utils/errors";
import { ETIQUETA_ROL, ROL_VISOR_RESERVAS } from "../constants/roles";
import { ETIQUETA_GRUPO, SECCIONES_ADMIN } from "../constants/secciones";

const DRAWER_WIDTH = 256;

function CambiarPasswordDialog({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);

  function cerrar() {
    setActual("");
    setNueva("");
    setConfirmacion("");
    setError(null);
    setExito(false);
    onCerrar();
  }

  async function enviar() {
    if (!actual || !nueva) return;
    if (nueva !== confirmacion) {
      setError("La confirmación no coincide con la nueva contraseña.");
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      await cambiarPassword(actual, nueva);
      setExito(true);
      setActual("");
      setNueva("");
      setConfirmacion("");
    } catch (e) {
      setError(mensajeError(e, "No se pudo cambiar la contraseña."));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={abierto} onClose={cerrar} maxWidth="xs" fullWidth>
      <DialogTitle>Cambiar contraseña</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {exito && <Alert severity="success">Contraseña actualizada correctamente.</Alert>}
          <TextField
            label="Contraseña actual"
            type="password"
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            fullWidth
          />
          <TextField
            label="Nueva contraseña"
            type="password"
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            fullWidth
          />
          <TextField
            label="Confirmar nueva contraseña"
            type="password"
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
            fullWidth
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={cerrar} disabled={enviando}>
          Cerrar
        </Button>
        <Button variant="contained" onClick={enviar} disabled={enviando || !actual || !nueva}>
          Guardar
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function AdminLayout() {
  const { token, nombre, rol, cerrarSesion } = useAuth();
  const config = useConfig();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerAbierto, setDrawerAbierto] = useState(false);
  const [dialogPasswordAbierto, setDialogPasswordAbierto] = useState(false);

  const esVisorReservas = rol === ROL_VISOR_RESERVAS;
  const secciones = esVisorReservas
    ? SECCIONES_ADMIN.filter((s) => s.ruta === "/admin/reservas")
    : SECCIONES_ADMIN;
  const grupos = (["operacion", "catalogo", "sistema"] as const)
    .map((g) => ({ grupo: g, items: secciones.filter((s) => s.grupo === g) }))
    .filter((g) => g.items.length > 0);

  useEffect(() => {
    if (esVisorReservas && location.pathname !== "/admin/reservas") {
      navigate("/admin/reservas", { replace: true });
    }
  }, [esVisorReservas, location.pathname, navigate]);

  if (!token) return <Navigate to="/admin/login" replace />;

  function esRutaActiva(ruta: string) {
    return ruta === "/admin" ? location.pathname === "/admin" : location.pathname.startsWith(ruta);
  }
  const seccionActual = SECCIONES_ADMIN.find((s) => esRutaActiva(s.ruta));

  const contenidoDrawer = (
    <Box sx={{ width: DRAWER_WIDTH, display: "flex", flexDirection: "column", height: "100%" }} role="presentation">
      <Toolbar sx={{ px: 2.5 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }} noWrap>
            {config.sistema_nombre || "Administración"}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap display="block">
            {rol ? ETIQUETA_ROL[rol] ?? rol : ""}
          </Typography>
        </Box>
      </Toolbar>
      <Divider />
      <Box sx={{ flexGrow: 1, overflowY: "auto", py: 1 }}>
        {grupos.map(({ grupo, items }) => (
          <List
            key={grupo}
            dense
            subheader={
              grupos.length > 1 ? (
                <ListSubheader sx={{ bgcolor: "transparent", lineHeight: "32px", fontSize: "0.7rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  {ETIQUETA_GRUPO[grupo]}
                </ListSubheader>
              ) : undefined
            }
          >
            {items.map((s) => (
              <ListItemButton
                key={s.ruta}
                component={Link}
                to={s.ruta}
                selected={esRutaActiva(s.ruta)}
                onClick={() => setDrawerAbierto(false)}
              >
                <ListItemIcon>{s.icono}</ListItemIcon>
                <ListItemText primary={s.texto} primaryTypographyProps={{ fontSize: "0.9rem" }} />
              </ListItemButton>
            ))}
          </List>
        ))}
      </Box>
      <Divider />
      <List dense>
        <ListItemButton component="a" href="/" target="_blank" rel="noopener">
          <ListItemIcon><OpenInNewIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Ver portal" primaryTypographyProps={{ fontSize: "0.9rem" }} />
        </ListItemButton>
        <ListItemButton onClick={() => setDialogPasswordAbierto(true)}>
          <ListItemIcon><LockResetIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Cambiar contraseña" primaryTypographyProps={{ fontSize: "0.9rem" }} />
        </ListItemButton>
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      {/* La barra superior ocupa solo el área de contenido: el menú lateral va de arriba a abajo. */}
      <AppBar position="fixed" sx={{ width: { md: `calc(100% - ${DRAWER_WIDTH}px)` }, ml: { md: `${DRAWER_WIDTH}px` } }}>
        <Toolbar sx={{ gap: 1 }}>
          <IconButton
            color="inherit"
            edge="start"
            aria-label="Abrir menú"
            onClick={() => setDrawerAbierto(true)}
            sx={{ display: { md: "none" } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="subtitle1" sx={{ flexGrow: 1, fontWeight: 600 }} noWrap>
            {seccionActual?.texto ?? "Panel de administración"}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ display: { xs: "none", sm: "block" } }} noWrap>
            {nombre}
          </Typography>
          <Button
            variant="outlined"
            color="inherit"
            size="small"
            onClick={() => {
              cerrarSesion();
              navigate("/admin/login");
            }}
          >
            Salir
          </Button>
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
        <Drawer
          variant="temporary"
          open={drawerAbierto}
          onClose={() => setDrawerAbierto(false)}
          ModalProps={{ keepMounted: true }}
          sx={{ display: { xs: "block", md: "none" }, "& .MuiDrawer-paper": { width: DRAWER_WIDTH } }}
        >
          {contenidoDrawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: "none", md: "block" },
            "& .MuiDrawer-paper": { width: DRAWER_WIDTH, boxSizing: "border-box" },
          }}
          open
        >
          {contenidoDrawer}
        </Drawer>
      </Box>

      <Box component="main" sx={{ flexGrow: 1, width: { md: `calc(100% - ${DRAWER_WIDTH}px)` }, minWidth: 0 }}>
        <Toolbar />
        <Box sx={{ p: { xs: 2, sm: 3, lg: 5 }, maxWidth: 1400, mx: "auto" }}>
          <Outlet />
        </Box>
      </Box>

      <CambiarPasswordDialog abierto={dialogPasswordAbierto} onCerrar={() => setDialogPasswordAbierto(false)} />
    </Box>
  );
}
