import { useEffect, useMemo } from "react";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { useLocation } from "react-router-dom";
import AppRoutes from "./routes/AppRoutes";
import { ConfigProvider } from "./contexts/ConfigContext";
import { useConfig } from "./hooks/useConfig";
import { createAppTheme } from "./theme";

/** Al navegar a otra página, la vista vuelve arriba (las SPA conservan el scroll). */
function ScrollArriba() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}

function ThemedRoutes() {
  const config = useConfig();
  const theme = useMemo(
    () => createAppTheme(config.color_primario, config.color_secundario),
    [config.color_primario, config.color_secundario]
  );

  useEffect(() => {
    if (config.sistema_nombre) document.title = config.sistema_nombre;
  }, [config.sistema_nombre]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ScrollArriba />
      <AppRoutes />
    </ThemeProvider>
  );
}

export default function App() {
  return (
    <ConfigProvider>
      <ThemedRoutes />
    </ConfigProvider>
  );
}
