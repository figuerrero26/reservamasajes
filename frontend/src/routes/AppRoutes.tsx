import { Route, Routes } from "react-router-dom";
import PublicLayout from "../layouts/PublicLayout";
import AdminLayout from "../layouts/AdminLayout";
import ReservaPage from "../pages/ReservaPage";
import LoginPage from "../pages/LoginPage";
import DashboardPage from "../pages/admin/DashboardPage";

export default function AppRoutes() {
  return (
    <Routes>
      {/* Flujo público del colaborador */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<ReservaPage />} />
      </Route>

      {/* Administración */}
      <Route path="/admin/login" element={<LoginPage />} />
      <Route element={<AdminLayout />}>
        <Route path="/admin" element={<DashboardPage />} />
      </Route>
    </Routes>
  );
}
