"""Política de contraseñas de las cuentas administrativas.

Una sola fuente para el alta de administradores, el restablecimiento por otro administrador
y el cambio de la contraseña propia (el panel muestra las mismas reglas, ver
frontend/src/utils/password.ts). Las contraseñas nunca se guardan ni se registran en texto
plano: solo su hash Bcrypt (ver app/auth/security.py).
"""
import re
import unicodedata

LONGITUD_MINIMA = 10
# Bcrypt solo usa los primeros 72 BYTES: una contraseña más larga se truncaría en silencio.
BYTES_MAXIMOS = 72

# Contraseñas muy usadas o del propio sistema (comparación sin mayúsculas ni símbolos).
_COMUNES = {
    "password", "contrasena", "contraseña", "admin", "administrador", "qwerty", "123456789",
    "1234567890", "abc123", "iloveyou", "bienvenido", "reservas", "sigra", "infraestructuref",
    "admin123", "password123", "qwerty123",
}


def _normalizar(texto: str) -> str:
    sin_tildes = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", sin_tildes.lower())


def problemas_password(password: str, usuario: str | None = None, nombre: str | None = None) -> list[str]:
    """Lista de requisitos que la contraseña NO cumple (vacía = válida)."""
    problemas: list[str] = []
    if len(password) < LONGITUD_MINIMA:
        problemas.append(f"Debe tener al menos {LONGITUD_MINIMA} caracteres.")
    if len(password.encode("utf-8")) > BYTES_MAXIMOS:
        problemas.append("Es demasiado larga: usa como máximo 72 caracteres (sin emojis ni símbolos especiales largos).")
    if not re.search(r"[a-záéíóúüñ]", password):
        problemas.append("Debe incluir al menos una letra minúscula.")
    if not re.search(r"[A-ZÁÉÍÓÚÜÑ]", password):
        problemas.append("Debe incluir al menos una letra mayúscula.")
    if not re.search(r"\d", password):
        problemas.append("Debe incluir al menos un número.")
    if not re.search(r"[^\w\s]|_", password):
        problemas.append("Debe incluir al menos un símbolo (por ejemplo ! * # $ -).")
    if password != password.strip():
        problemas.append("No puede empezar ni terminar con espacios.")

    normalizada = _normalizar(password)
    sin_digitos = re.sub(r"\d+$", "", normalizada)
    if normalizada in _COMUNES or sin_digitos in _COMUNES:
        problemas.append("Es una contraseña demasiado común: elige otra.")
    for dato in (usuario, nombre):
        if not dato:
            continue
        partes = [_normalizar(p) for p in re.split(r"[@\s._-]+", dato)]
        if any(len(p) >= 4 and p in normalizada for p in partes):
            problemas.append("No puede contener tu usuario ni tu nombre.")
            break
    if len(set(password)) < 4 and len(password) >= LONGITUD_MINIMA:
        problemas.append("Usa más caracteres distintos (evita repeticiones).")
    return problemas


def validar_password(password: str, usuario: str | None = None, nombre: str | None = None) -> None:
    """Lanza ValueError con todos los requisitos que faltan."""
    problemas = problemas_password(password, usuario, nombre)
    if problemas:
        raise ValueError("La contraseña no es segura: " + " ".join(problemas))
