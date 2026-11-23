/** Política de contraseñas de las cuentas administrativas: misma regla que el backend
 * (backend/app/auth/politica_password.py), que es quien la hace cumplir. Aquí solo sirve para
 * guiar a quien escribe la contraseña antes de enviarla. */

export const LONGITUD_MINIMA_PASSWORD = 10;
const BYTES_MAXIMOS = 72;

export interface RequisitoPassword {
  clave: string;
  texto: string;
  cumple: boolean;
}

const COMUNES = new Set([
  "password", "contrasena", "admin", "administrador", "qwerty", "123456789", "1234567890", "abc123",
  "iloveyou", "bienvenido", "reservas", "sigra", "infraestructuref", "admin123", "password123", "qwerty123",
]);

function normalizar(texto: string): string {
  return texto.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function contieneDatos(password: string, datos: (string | null | undefined)[]): boolean {
  const normalizada = normalizar(password);
  return datos.some((dato) =>
    !!dato && dato.split(/[@\s._-]+/).map(normalizar).some((p) => p.length >= 4 && normalizada.includes(p)));
}

/** Requisitos con su estado (para la lista de verificación del formulario). */
export function requisitosPassword(password: string, datos: { usuario?: string | null; nombre?: string | null } = {}): RequisitoPassword[] {
  const normalizada = normalizar(password);
  const bytes = new TextEncoder().encode(password).length;
  return [
    { clave: "longitud", texto: `Al menos ${LONGITUD_MINIMA_PASSWORD} caracteres`, cumple: password.length >= LONGITUD_MINIMA_PASSWORD && bytes <= BYTES_MAXIMOS },
    { clave: "mayuscula", texto: "Una letra mayúscula", cumple: /[A-ZÁÉÍÓÚÜÑ]/.test(password) },
    { clave: "minuscula", texto: "Una letra minúscula", cumple: /[a-záéíóúüñ]/.test(password) },
    { clave: "numero", texto: "Un número", cumple: /\d/.test(password) },
    { clave: "simbolo", texto: "Un símbolo (! * # $ - …)", cumple: /[^\p{L}\p{N}\s]|_/u.test(password) },
    {
      clave: "personal",
      texto: "Sin el usuario, el nombre ni contraseñas comunes",
      cumple: password.length > 0 && password === password.trim()
        && !COMUNES.has(normalizada) && !COMUNES.has(normalizada.replace(/\d+$/, ""))
        && !contieneDatos(password, [datos.usuario, datos.nombre])
        && new Set(password).size >= 4,
    },
  ];
}

export function passwordCumple(password: string, datos: { usuario?: string | null; nombre?: string | null } = {}): boolean {
  return requisitosPassword(password, datos).every((r) => r.cumple);
}

/** Contraseña aleatoria que cumple la política (generada en el navegador; nunca se envía
 * a ningún sitio salvo al guardarla). */
export function generarPasswordSegura(longitud = 16): string {
  const grupos = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!*#$-_.?"];
  const todos = grupos.join("");
  const aleatorio = (max: number) => {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0] % max;
  };
  const caracteres = grupos.map((g) => g[aleatorio(g.length)]);
  while (caracteres.length < longitud) caracteres.push(todos[aleatorio(todos.length)]);
  for (let i = caracteres.length - 1; i > 0; i--) {
    const j = aleatorio(i + 1);
    [caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]];
  }
  return caracteres.join("");
}
