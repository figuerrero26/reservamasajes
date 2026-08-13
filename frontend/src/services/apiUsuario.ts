import axios from "axios";

// Instancia separada de la del panel admin: cada una adjunta un JWT distinto (scope "usuario"
// vs "admin"), guardado bajo una clave de localStorage distinta, para que ambas sesiones
// puedan coexistir en el mismo navegador sin pisarse.
const apiUsuario = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api/v1",
});

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
    if (error?.response?.status === 401 && !window.location.pathname.startsWith("/admin")) {
      localStorage.removeItem("usuario_token");
      localStorage.removeItem("usuario_nombre");
      localStorage.removeItem("usuario_correo");
    }
    return Promise.reject(error);
  }
);

export default apiUsuario;
