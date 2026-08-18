import { useEffect, useState, type ReactNode } from "react";
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
  TextField,
  Toolbar,
  Typography,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import DashboardIcon from "@mui/icons-material/Dashboard";
import CategoryIcon from "@mui/icons-material/Category";
import SpaIcon from "@mui/icons-material/Spa";
import EventNoteIcon from "@mui/icons-material/EventNote";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import PeopleIcon from "@mui/icons-material/People";
import BlockIcon from "@mui/icons-material/Block";
import CelebrationIcon from "@mui/icons-material/Celebration";
import SettingsIcon from "@mui/icons-material/Settings";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import HistoryIcon from "@mui/icons-material/History";
import LockResetIcon from "@mui/icons-material/LockReset";
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { cambiarPassword } from "../services/auth";
import { mensajeError } from "../utils/errors";
import { ROL_VISOR_RESERVAS } from "../constants/roles";

const DRAWER_WIDTH = 240;

interface Seccion {
  texto: string;
  ruta: string;
  icono: ReactNode;
}

const SECCIONES: Seccion[] = [
  { texto: "Dashboard", ruta: "/admin", icono: <DashboardIcon /> },
  { texto: "Áreas", ruta: "/admin/areas", icono: <CategoryIcon /> },
  { texto: "Servicios", ruta: "/admin/servicios", icono: <SpaIcon /> },
  { texto: "Agendas", ruta: "/admin/agendas", icono: <EventNoteIcon /> },
  { texto: "Reservas", ruta: "/admin/reservas", icono: <EventAvailableIcon /> },
  { texto: "Usuarios", ruta: "/admin/usuarios", icono: <PeopleIcon /> },
  { texto: "Bloqueos", ruta: "/admin/bloqueos", icono: <BlockIcon /> },
  { texto: "Festivos", ruta: "/admin/festivos", icono: <CelebrationIcon /> },
  { texto: "Configuración", ruta: "/admin/configuracion", icono: <SettingsIcon /> },
  { texto: "Administradores", ruta: "/admin/administradores", icono: <AdminPanelSettingsIcon /> },
  { texto: "Auditoría", ruta: "/admin/auditoria", icono: <HistoryIcon /> },
];

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
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerAbierto, setDrawerAbierto] = useState(false);
  const [dialogPasswordAbierto, setDialogPasswordAbierto] = useState(false);

  const esVisorReservas = rol === ROL_VISOR_RESERVAS;
  const secciones = esVisorReservas
    ? SECCIONES.filter((s) => s.ruta === "/admin/reservas")
    : SECCIONES;

  useEffect(() => {
    if (esVisorReservas && location.pathname !== "/admin/reservas") {
      navigate("/admin/reservas", { replace: true });
    }
  }, [esVisorReservas, location.pathname, navigate]);

  if (!token) return <Navigate to="/admin/login" replace />;

  function esRutaActiva(ruta: string) {
    return ruta === "/admin" ? location.pathname === "/admin" : location.pathname.startsWith(ruta);
  }

  const contenidoDrawer = (
    <Box sx={{ width: DRAWER_WIDTH }} role="presentation">
      <Toolbar>
        <Typography variant="h6" noWrap>
          Menú
        </Typography>
      </Toolbar>
      <Divider />
      <List>
        {secciones.map((s) => (
          <ListItemButton
            key={s.ruta}
            component={Link}
            to={s.ruta}
            selected={esRutaActiva(s.ruta)}
            onClick={() => setDrawerAbierto(false)}
          >
            <ListItemIcon>{s.icono}</ListItemIcon>
            <ListItemText primary={s.texto} />
          </ListItemButton>
        ))}
      </List>
      <Divider />
      <List>
        <ListItemButton onClick={() => setDialogPasswordAbierto(true)}>
          <ListItemIcon>
            <LockResetIcon />
          </ListItemIcon>
          <ListItemText primary="Cambiar contraseña" />
        </ListItemButton>
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar position="fixed" elevation={0} sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => setDrawerAbierto(true)}
            sx={{ mr: 2, display: { md: "none" } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1 }} noWrap>
            Panel de administración
          </Typography>
          <Typography variant="body2" sx={{ mr: 2, display: { xs: "none", sm: "block" } }}>
            {nombre}
          </Typography>
          <Button
            color="inherit"
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
        <Box sx={{ p: { xs: 2, sm: 3 } }}>
          <Outlet />
        </Box>
      </Box>

      <CambiarPasswordDialog abierto={dialogPasswordAbierto} onCerrar={() => setDialogPasswordAbierto(false)} />
    </Box>
  );
}
