import { createContext, useEffect, useState, type ReactNode } from "react";
import type { ConfiguracionGeneral } from "../types";
import { obtenerConfiguracion } from "../services/configuracion";

const DEFAULT_CONFIG: ConfiguracionGeneral = {
  empresa_nombre: "Empresa",
  sistema_nombre: "Reservas de Bienestar",
  logo_url: null,
  color_primario: "#1F3A5F",
  color_secundario: "#2E6DA4",
  zona_horaria: "America/Bogota",
};

export const ConfigContext = createContext<ConfiguracionGeneral>(DEFAULT_CONFIG);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ConfiguracionGeneral>(DEFAULT_CONFIG);

  useEffect(() => {
    obtenerConfiguracion()
      .then((c) => setConfig((prev) => ({ ...prev, ...c })))
      .catch(() => undefined); // si falla, se usan los valores por defecto
  }, []);

  return <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>;
}
