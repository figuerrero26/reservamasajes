const EXTENSIONES_VIDEO = [".mp4", ".webm", ".mov"];

/** El banner de bienvenida acepta imagen, GIF o video (ver backend
 * TIPOS_BIENVENIDA_PERMITIDOS); esto decide si hay que renderizar <video> en vez de <img>. */
export function esVideo(url: string): boolean {
  const sinQuery = url.split(/[?#]/)[0].toLowerCase();
  return EXTENSIONES_VIDEO.some((ext) => sinQuery.endsWith(ext));
}
