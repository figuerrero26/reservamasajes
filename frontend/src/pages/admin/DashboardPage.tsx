import { Box, Card, CardActionArea, CardContent, Grid, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import CategoryIcon from "@mui/icons-material/Category";
import SpaIcon from "@mui/icons-material/Spa";
import EventNoteIcon from "@mui/icons-material/EventNote";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import PeopleIcon from "@mui/icons-material/People";
import BlockIcon from "@mui/icons-material/Block";
import CelebrationIcon from "@mui/icons-material/Celebration";
import SettingsIcon from "@mui/icons-material/Settings";
import HistoryIcon from "@mui/icons-material/History";
import type { ReactNode } from "react";

interface Seccion {
  titulo: string;
  descripcion: string;
  ruta: string;
  icono: ReactNode;
}

const SECCIONES: Seccion[] = [
  { titulo: "Áreas", descripcion: "Administra las áreas del portal de reservas.", ruta: "/admin/areas", icono: <CategoryIcon fontSize="large" /> },
  { titulo: "Servicios", descripcion: "Administra los servicios de bienestar ofrecidos.", ruta: "/admin/servicios", icono: <SpaIcon fontSize="large" /> },
  { titulo: "Agendas", descripcion: "Crea y configura las agendas de atención.", ruta: "/admin/agendas", icono: <EventNoteIcon fontSize="large" /> },
  { titulo: "Reservas", descripcion: "Busca, crea y cancela reservas de colaboradores.", ruta: "/admin/reservas", icono: <EventAvailableIcon fontSize="large" /> },
  { titulo: "Usuarios", descripcion: "Consulta y gestiona el acceso de los colaboradores.", ruta: "/admin/usuarios", icono: <PeopleIcon fontSize="large" /> },
  { titulo: "Bloqueos", descripcion: "Bloquea días o rangos de horas en las agendas.", ruta: "/admin/bloqueos", icono: <BlockIcon fontSize="large" /> },
  { titulo: "Festivos", descripcion: "Administra el calendario de días festivos.", ruta: "/admin/festivos", icono: <CelebrationIcon fontSize="large" /> },
  { titulo: "Configuración", descripcion: "Ajusta los datos generales y la semana activa.", ruta: "/admin/configuracion", icono: <SettingsIcon fontSize="large" /> },
  { titulo: "Auditoría", descripcion: "Revisa el historial de acciones administrativas.", ruta: "/admin/auditoria", icono: <HistoryIcon fontSize="large" /> },
];

export default function DashboardPage() {
  const navigate = useNavigate();

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Panel de administración
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Selecciona una sección para gestionarla.
      </Typography>
      <Grid container spacing={2}>
        {SECCIONES.map((s) => (
          <Grid item xs={12} sm={6} md={4} key={s.ruta}>
            <Card variant="outlined" sx={{ height: "100%" }}>
              <CardActionArea onClick={() => navigate(s.ruta)} sx={{ height: "100%", p: 1 }}>
                <CardContent>
                  <Box sx={{ color: "primary.main", mb: 1 }}>{s.icono}</Box>
                  <Typography variant="h6" gutterBottom>
                    {s.titulo}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {s.descripcion}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
