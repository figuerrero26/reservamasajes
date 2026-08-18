import { Route, Routes } from "react-router-dom";
import PublicLayout from "../layouts/PublicLayout";
import AdminLayout from "../layouts/AdminLayout";
import EventosPage from "../pages/EventosPage";
import DisponibilidadPage from "../pages/DisponibilidadPage";
import LoginUsuarioPage from "../pages/LoginUsuarioPage";
import RegistroPage from "../pages/RegistroPage";
import OlvidePasswordPage from "../pages/OlvidePasswordPage";
import RestablecerPasswordPage from "../pages/RestablecerPasswordPage";
import MisReservasPage from "../pages/MisReservasPage";
import LoginPage from "../pages/LoginPage";
import DashboardPage from "../pages/admin/DashboardPage";
import AreasPage from "../pages/admin/AreasPage";
import ServiciosPage from "../pages/admin/ServiciosPage";
import AgendasPage from "../pages/admin/AgendasPage";
import ReservasPage from "../pages/admin/ReservasPage";
import UsuariosPage from "../pages/admin/UsuariosPage";
import AdministradoresPage from "../pages/admin/AdministradoresPage";
import BloqueosPage from "../pages/admin/BloqueosPage";
import FestivosPage from "../pages/admin/FestivosPage";
import ConfiguracionPage from "../pages/admin/ConfiguracionPage";
import AuditoriaPage from "../pages/admin/AuditoriaPage";

export default function AppRoutes() {
  return (
    <Routes>
      {/* Flujo público del colaborador */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<EventosPage />} />
        <Route path="/eventos/:id" element={<DisponibilidadPage />} />
        <Route path="/login" element={<LoginUsuarioPage />} />
        <Route path="/registro" element={<RegistroPage />} />
        <Route path="/olvide-password" element={<OlvidePasswordPage />} />
        <Route path="/restablecer-password" element={<RestablecerPasswordPage />} />
        <Route path="/mis-reservas" element={<MisReservasPage />} />
      </Route>

      {/* Administración */}
      <Route path="/admin/login" element={<LoginPage />} />
      <Route element={<AdminLayout />}>
        <Route path="/admin" element={<DashboardPage />} />
        <Route path="/admin/areas" element={<AreasPage />} />
        <Route path="/admin/servicios" element={<ServiciosPage />} />
        <Route path="/admin/agendas" element={<AgendasPage />} />
        <Route path="/admin/reservas" element={<ReservasPage />} />
        <Route path="/admin/usuarios" element={<UsuariosPage />} />
        <Route path="/admin/bloqueos" element={<BloqueosPage />} />
        <Route path="/admin/festivos" element={<FestivosPage />} />
        <Route path="/admin/configuracion" element={<ConfiguracionPage />} />
        <Route path="/admin/administradores" element={<AdministradoresPage />} />
        <Route path="/admin/auditoria" element={<AuditoriaPage />} />
      </Route>
    </Routes>
  );
}
