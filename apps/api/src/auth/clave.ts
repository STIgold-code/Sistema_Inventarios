import * as bcrypt from "bcrypt";

/**
 * Reglas y hash de claves de usuario. Sin dependencias de Nest a proposito: lo
 * usan tambien los seeds. Todo hash nuevo de clave debe pasar por
 * {@link hashearClave} y toda clave nueva por {@link validarClaveNueva}.
 */

/** Costo de bcrypt para las claves de usuario. Punto unico de verdad. */
export const COSTO_BCRYPT = 10;

export const LARGO_MINIMO_CLAVE = 8;

/** bcrypt ignora lo que excede 72 BYTES (no caracteres): se rechaza para no truncar. */
export const LARGO_MAXIMO_CLAVE_BYTES = 72;

/**
 * Parte local del correo mas corta que esto no se exige ausente en la clave:
 * con 1-2 letras rechazaria casi cualquier clave sin aportar seguridad.
 */
const LARGO_MINIMO_PARTE_LOCAL = 3;

/**
 * Llave de comparacion para la lista de prohibidas y la regla del correo:
 * Unicode NFKC (unifica formas compatibles, p. ej. letras de ancho completo),
 * sin diacriticos (NFD + quitar marcas: "ñ" compuesta o descompuesta -> "n",
 * "í" -> "i"), en minusculas y sin espacios en los extremos. Solo sirve para
 * comparar: la clave se hashea tal como la escribio el usuario.
 */
export function llaveComparacion(valor: string): string {
  return valor
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Claves prohibidas: todas las que alguna vez estuvieron en los seeds del
 * repositorio y las mas comunes de 8 o mas caracteres. Se guardan ya pasadas
 * por {@link llaveComparacion}.
 */
const CLAVES_PROHIBIDAS: ReadonlySet<string> = new Set(
  [
    // Historicas de los seeds.
    "admin1234",
    "almacen1234",
    "compras1234",
    "ventas1234",
    "auditor1234",
    // Comunes.
    "12345678",
    "123456789",
    "1234567890",
    "12341234",
    "87654321",
    "123123123",
    "11111111",
    "00000000",
    "password",
    "password1",
    "password123",
    "passw0rd",
    "qwerty123",
    "qwertyuiop",
    "iloveyou",
    "abc12345",
    "abcd1234",
    "admin123",
    "administrador",
    "contrasena",
    "bienvenido",
    "inventarios",
    "bmingenieros",
  ].map(llaveComparacion),
);

/** Largo de la clave en bytes UTF-8 (lo que realmente procesa bcrypt). */
export function bytesDeClave(clave: string): number {
  return Buffer.byteLength(clave, "utf8");
}

/** true si la clave supera lo que bcrypt procesa (se truncaria en silencio). */
export function excedeLargoClave(clave: string): boolean {
  return bytesDeClave(clave) > LARGO_MAXIMO_CLAVE_BYTES;
}

/**
 * Valida una clave nueva contra las reglas de la empresa. Devuelve el mensaje
 * de error (para mostrar al usuario) o null si la clave es aceptable.
 */
export function validarClaveNueva(clave: string, email: string): string | null {
  if (clave.length < LARGO_MINIMO_CLAVE) {
    return `La nueva clave debe tener al menos ${LARGO_MINIMO_CLAVE} caracteres`;
  }
  if (excedeLargoClave(clave)) {
    return "La nueva clave es demasiado larga (maximo 72 bytes; las letras con tilde y la ñ ocupan 2)";
  }
  const llave = llaveComparacion(clave);
  if (CLAVES_PROHIBIDAS.has(llave)) {
    return "La nueva clave es demasiado comun o ya fue publicada; elige otra";
  }
  const parteLocal = llaveComparacion(email.split("@")[0] ?? "");
  if (parteLocal.length >= LARGO_MINIMO_PARTE_LOCAL && llave.includes(parteLocal)) {
    return "La clave no debe contener el usuario del correo";
  }
  return null;
}

/** Hashea una clave en texto plano con el costo vigente. */
export function hashearClave(clavePlana: string): Promise<string> {
  return bcrypt.hash(clavePlana, COSTO_BCRYPT);
}

/** Compara una clave en texto plano contra su hash persistido. */
export function verificarClave(
  clavePlana: string,
  hashClave: string,
): Promise<boolean> {
  return bcrypt.compare(clavePlana, hashClave);
}
