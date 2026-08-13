import { useMemo } from "react";
import { ThemeProvider } from "@mui/material";
import AppRoutes from "./routes/AppRoutes";
import { ConfigProvider } from "./contexts/ConfigContext";
import { useConfig } from "./hooks/useConfig";
import { createAppTheme } from "./theme";

function ThemedRoutes() {
  const config = useConfig();
  const theme = useMemo(
    () => createAppTheme(config.color_primario, config.color_secundario),
    [config.color_primario, config.color_secundario]
  );
  return (
    <ThemeProvider theme={theme}>
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
