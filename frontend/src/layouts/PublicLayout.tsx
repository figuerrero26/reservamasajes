import { AppBar, Box, Container, Toolbar, Typography } from "@mui/material";
import SpaIcon from "@mui/icons-material/Spa";
import { Outlet } from "react-router-dom";

export default function PublicLayout() {
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar position="static" elevation={0}>
        <Toolbar>
          <SpaIcon sx={{ mr: 1 }} />
          <Typography variant="h6">Reservas de Bienestar</Typography>
        </Toolbar>
      </AppBar>
      <Container maxWidth="sm" sx={{ py: 4 }}>
        <Outlet />
      </Container>
    </Box>
  );
}
