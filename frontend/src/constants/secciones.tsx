import type { ReactNode } from "react";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import SpaOutlinedIcon from "@mui/icons-material/SpaOutlined";
import EventAvailableOutlinedIcon from "@mui/icons-material/EventAvailableOutlined";
import PeopleOutlineIcon from "@mui/icons-material/PeopleOutline";
import BlockOutlinedIcon from "@mui/icons-material/BlockOutlined";
import CelebrationOutlinedIcon from "@mui/icons-material/CelebrationOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";

export interface SeccionAdmin {
  texto: string;
  descripcion: string;
  ruta: string;
  icono: ReactNode;
  grupo: "operacion" | "catalogo" | "sistema";
}

/** Única fuente de las secciones del panel: la usan el menú lateral y el dashboard (antes
 * cada uno tenía su propia lista y se habían desincronizado). */
export const SECCIONES_ADMIN: SeccionAdmin[] = [
  { texto: "Inicio", descripcion: "Resumen del día.", ruta: "/admin", icono: <DashboardOutlinedIcon />, grupo: "operacion" },
  { texto: "Reservas", descripcion: "Turnos del día, reservas manuales, asistencia y cancelaciones.", ruta: "/admin/reservas", icono: <EventAvailableOutlinedIcon />, grupo: "operacion" },
  { texto: "Usuarios", descripcion: "Cuentas de colaboradores: bloqueo, contraseña y excepciones.", ruta: "/admin/usuarios", icono: <PeopleOutlineIcon />, grupo: "operacion" },
  // Catálogo: todo lo de cada evento (también sus agendas, fechas e historial) se gestiona
  // dentro de «Eventos»; ya no hay una sección de agendas aparte.
  { texto: "Eventos", descripcion: "Eventos de reserva (agendas, horarios y turnos) y de inscripción (fechas, cupos e inscritos), todo en un solo lugar.", ruta: "/admin/eventos", icono: <SpaOutlinedIcon />, grupo: "catalogo" },
  { texto: "Áreas", descripcion: "Las áreas a las que pertenece cada evento.", ruta: "/admin/areas", icono: <CategoryOutlinedIcon />, grupo: "catalogo" },
  { texto: "Bloqueos", descripcion: "Días u horas sin atención en una o todas las agendas.", ruta: "/admin/bloqueos", icono: <BlockOutlinedIcon />, grupo: "catalogo" },
  { texto: "Festivos", descripcion: "Días no laborables del calendario.", ruta: "/admin/festivos", icono: <CelebrationOutlinedIcon />, grupo: "catalogo" },
  { texto: "Configuración", descripcion: "Marca, contacto, textos del portal y correo.", ruta: "/admin/configuracion", icono: <SettingsOutlinedIcon />, grupo: "sistema" },
  { texto: "Administradores", descripcion: "Cuentas del panel, roles y contraseñas.", ruta: "/admin/administradores", icono: <AdminPanelSettingsOutlinedIcon />, grupo: "sistema" },
  { texto: "Auditoría", descripcion: "Historial de acciones administrativas.", ruta: "/admin/auditoria", icono: <HistoryOutlinedIcon />, grupo: "sistema" },
];

export const ETIQUETA_GRUPO: Record<SeccionAdmin["grupo"], string> = {
  operacion: "Operación",
  catalogo: "Catálogo",
  sistema: "Sistema",
};
