import api from "./api";
import type { ConfiguracionGeneral, PlantillaCorreo, SmtpConfig, SmtpConfigUpdate } from "../types";

// Endpoint público (sin autenticación); se usa tanto desde el portal como desde el admin
// para precargar el formulario, por eso se deja en la instancia base.
export const obtenerConfiguracion = async () =>
  (await api.get<ConfiguracionGeneral>("/configuracion")).data;

export const actualizarConfiguracion = async (clave: string, valor: string | null) =>
  api.put("/configuracion", { clave, valor });

export const subirImagenBienvenida = async (archivo: File) => {
  const form = new FormData();
  form.append("archivo", archivo);
  return (await api.post<{ imagen_bienvenida_url: string }>("/configuracion/imagen-bienvenida", form))
    .data.imagen_bienvenida_url;
};

export const obtenerConfiguracionSmtp = async () =>
  (await api.get<SmtpConfig>("/configuracion/smtp")).data;

export const actualizarConfiguracionSmtp = async (payload: SmtpConfigUpdate) =>
  (await api.put<SmtpConfig>("/configuracion/smtp", payload)).data;

export const enviarCorreoPrueba = async (destinatario: string) =>
  api.post("/configuracion/smtp/prueba", { destinatario });

export const obtenerPlantillaCorreo = async () =>
  (await api.get<PlantillaCorreo>("/configuracion/plantilla-correo")).data;

export const previsualizarPlantillaCorreo = async (cuerpo: string) =>
  (await api.post<{ html: string }>("/configuracion/plantilla-correo/vista-previa", { cuerpo })).data.html;

export const subirImagenCorreo = async (archivo: File) => {
  const form = new FormData();
  form.append("archivo", archivo);
  return (await api.post<{ email_confirmacion_imagen_url: string }>("/configuracion/imagen-correo", form))
    .data.email_confirmacion_imagen_url;
};

export const subirLogo = async (archivo: File) => {
  const form = new FormData();
  form.append("archivo", archivo);
  return (await api.post<{ logo_url: string }>("/configuracion/logo", form)).data.logo_url;
};
