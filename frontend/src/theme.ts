import { createTheme } from "@mui/material/styles";

// Colores corporativos configurables desde configuracion_general (panel admin).
// Estos son solo el valor por defecto hasta que la configuración cargue.
export function createAppTheme(colorPrimario?: string | null, colorSecundario?: string | null) {
  return createTheme({
    palette: {
      primary: { main: colorPrimario || "#1F3A5F" },
      secondary: { main: colorSecundario || "#2E6DA4" },
      background: { default: "#F4F7FB" },
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: "'Inter', 'Segoe UI', Roboto, sans-serif",
      h4: { fontWeight: 700 },
      h5: { fontWeight: 600 },
    },
  });
}
