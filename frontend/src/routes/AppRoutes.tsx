import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import Loader from "../components/Loader";
import PublicLayout from "../layouts/PublicLayout";
import EventosPage from "../pages/EventosPage";
import DisponibilidadPage from "../pages/DisponibilidadPage";
import LoginUsuarioPage from "../pages/LoginUsuarioPage";
import RegistroPage from "../pages/RegistroPage";
import OlvidePasswordPage from "../pages/OlvidePasswordPage";
import RestablecerPasswordPage from "../pages/RestablecerPasswordPage";
import MisReservasPage from "../pages/MisReservasPage";
import ActividadDetallePage from "../pages/ActividadDetallePage";
import MisInscripcionesPage from "../pages/MisInscripcionesPage";
import LegalPage from "../pages/LegalPage";
import NoEncontradaPage from "../pages/NoEncontradaPage";

// El panel administrativo se carga bajo demanda: los colaboradores que solo usan el portal
// no descargan el código de administración.
const AdminLayout = lazy(() => import("../layouts/AdminLayout"));
const LoginPage = lazy(() => import("../pages/LoginPage"));
const DashboardPage = lazy(() => import("../pages/admin/DashboardPage"));
const AreasPage = lazy(() => import("../pages/admin/AreasPage"));
const ServiciosPage = lazy(() => import("../pages/admin/ServiciosPage"));
const AgendasPage = lazy(() => import("../pages/admin/AgendasPage"));
const ReservasPage = lazy(() => import("../pages/admin/ReservasPage"));
const ActividadesPage = lazy(() => import("../pages/admin/ActividadesPage"));
const UsuariosPage = lazy(() => import("../pages/admin/UsuariosPage"));
const AdministradoresPage = lazy(() => import("../pages/admin/AdministradoresPage"));
const BloqueosPage = lazy(() => import("../pages/admin/BloqueosPage"));
const FestivosPage = lazy(() => import("../pages/admin/FestivosPage"));
const ConfiguracionPage = lazy(() => import("../pages/admin/ConfiguracionPage"));
const AuditoriaPage = lazy(() => import("../pages/admin/AuditoriaPage"));

export default function AppRoutes() {
  return (
    <Suspense fallback={<Loader />}>
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
          <Route path="/actividades/:id" element={<ActividadDetallePage />} />
          <Route path="/mis-inscripciones" element={<MisInscripcionesPage />} />
          <Route path="/privacidad" element={<LegalPage tipo="privacidad" />} />
          <Route path="/terminos" element={<LegalPage tipo="terminos" />} />
          <Route path="*" element={<NoEncontradaPage />} />
        </Route>

        {/* Administración */}
        <Route path="/admin/login" element={<LoginPage />} />
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<DashboardPage />} />
          <Route path="/admin/areas" element={<AreasPage />} />
          <Route path="/admin/servicios" element={<ServiciosPage />} />
          <Route path="/admin/agendas" element={<AgendasPage />} />
          <Route path="/admin/reservas" element={<ReservasPage />} />
          <Route path="/admin/actividades" element={<ActividadesPage />} />
          <Route path="/admin/usuarios" element={<UsuariosPage />} />
          <Route path="/admin/bloqueos" element={<BloqueosPage />} />
          <Route path="/admin/festivos" element={<FestivosPage />} />
          <Route path="/admin/configuracion" element={<ConfiguracionPage />} />
          <Route path="/admin/administradores" element={<AdministradoresPage />} />
          <Route path="/admin/auditoria" element={<AuditoriaPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
