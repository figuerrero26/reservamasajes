import { AppBar, Box, Button, Container, Toolbar, Typography } from "@mui/material";
import { Navigate, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function AdminLayout() {
  const { token, nombre, cerrarSesion } = useAuth();
  const navigate = useNavigate();

  if (!token) return <Navigate to="/admin/login" replace />;

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar position="static" elevation={0}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Panel de administración
          </Typography>
          <Typography variant="body2" sx={{ mr: 2 }}>
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
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Outlet />
      </Container>
    </Box>
  );
}
