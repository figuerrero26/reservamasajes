import api from "./api";

/** Formatos y tamaño que acepta el backend para la imagen de un evento (ver
 * backend app/utils/uploads.py): el backend vuelve a validar tipo, tamaño y contenido real. */
export const TIPOS_IMAGEN_EVENTO = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const TAMANO_MAXIMO_IMAGEN_MB = 5;

/** Sube la imagen de un evento y devuelve la URL que se guarda en `imagen_url`. */
export async function subirImagenEvento(archivo: File): Promise<string> {
  const form = new FormData();
  form.append("archivo", archivo);
  const { data } = await api.post<{ url: string }>("/uploads/imagenes", form);
  return data.url;
}
