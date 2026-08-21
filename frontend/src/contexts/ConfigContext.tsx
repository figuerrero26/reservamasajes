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

const CLAVE_CACHE = "config_cache";

// La configuración (colores, logo, etc.) se pide al backend de forma asíncrona, así que el
// primer render siempre ocurriría con DEFAULT_CONFIG mientras esa petición viaja — eso es el
// destello de colores por defecto que se ve al abrir el sitio. Para evitarlo, se guarda la
// última configuración conocida en localStorage y se usa como estado inicial (sin esperar red);
// la petición real igual se hace siempre, por si el admin cambió algo desde la última visita.
function configInicial(): ConfiguracionGeneral {
  try {
    const cache = localStorage.getItem(CLAVE_CACHE);
    if (cache) return { ...DEFAULT_CONFIG, ...JSON.parse(cache) };
  } catch {
    // localStorage no disponible o JSON inválido: se sigue con el valor por defecto.
  }
  return DEFAULT_CONFIG;
}

export const ConfigContext = createContext<ConfiguracionGeneral>(DEFAULT_CONFIG);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ConfiguracionGeneral>(configInicial);

  useEffect(() => {
    obtenerConfiguracion()
      .then((c) => {
        setConfig((prev) => ({ ...prev, ...c }));
        try {
          localStorage.setItem(CLAVE_CACHE, JSON.stringify(c));
        } catch {
          // localStorage no disponible (modo privado, cuota llena, etc.): no es crítico.
        }
      })
      .catch(() => undefined); // si falla, se usan los valores por defecto o los de caché
  }, []);

  return <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>;
}
