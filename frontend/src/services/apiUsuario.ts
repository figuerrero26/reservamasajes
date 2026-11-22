import axios from "axios";

// Instancia separada de la del panel admin: cada una adjunta un JWT distinto (scope "usuario"
// vs "admin"), guardado bajo una clave de localStorage distinta, para que ambas sesiones
// puedan coexistir en el mismo navegador sin pisarse.
const apiUsuario = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api/v1",
});

/** Evento que escucha UsuarioAuthContext para cerrar la sesión en la interfaz (no solo en
 * localStorage) cuando el backend rechaza el token: expirado o cuenta bloqueada. */
export const EVENTO_SESION_USUARIO_EXPIRADA = "sesion-usuario-expirada";

apiUsuario.interceptors.request.use((config) => {
  const token = localStorage.getItem("usuario_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiUsuario.interceptors.response.use(
  (response) => response,
  (error) => {
    const conToken = Boolean(error?.config?.headers?.Authorization);
    if (error?.response?.status === 401 && conToken && !window.location.pathname.startsWith("/admin")) {
      window.dispatchEvent(new Event(EVENTO_SESION_USUARIO_EXPIRADA));
    }
    return Promise.reject(error);
  }
);

export default apiUsuario;
