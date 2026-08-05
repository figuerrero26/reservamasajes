import { createTheme } from "@mui/material/styles";

// Colores corporativos (configurables). Se pueden sobreescribir a futuro
// leyéndolos de configuracion_general en la API.
export const theme = createTheme({
  palette: {
    primary: { main: "#1F3A5F" },
    secondary: { main: "#2E6DA4" },
    background: { default: "#F4F7FB" },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: "'Inter', 'Segoe UI', Roboto, sans-serif",
    h4: { fontWeight: 700 },
    h5: { fontWeight: 600 },
  },
});
