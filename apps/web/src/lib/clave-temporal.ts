/**
 * Generacion de contraseñas temporales en el navegador (Web Crypto). Se usan
 * letras y digitos sin caracteres ambiguos (0/O, 1/l/I) para que se puedan
 * dictar o copiar sin errores.
 */

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
export const LARGO_CLAVE_GENERADA = 14;
export const LARGO_MINIMO_CLAVE = 8;

/**
 * Mayor multiplo del alfabeto que cabe en un byte: los bytes por encima se
 * descartan para que todos los caracteres tengan la misma probabilidad.
 */
const LIMITE_SIN_SESGO = 256 - (256 % ALFABETO.length);

function caracterAleatorio(): string {
  const buffer = new Uint8Array(1);
  for (;;) {
    crypto.getRandomValues(buffer);
    const byte = buffer[0] ?? 0;
    if (byte < LIMITE_SIN_SESGO) return ALFABETO.charAt(byte % ALFABETO.length);
  }
}

/** Contraseña aleatoria de {@link LARGO_CLAVE_GENERADA} caracteres con letras y digitos. */
export function generarClaveTemporal(): string {
  for (;;) {
    let clave = "";
    for (let i = 0; i < LARGO_CLAVE_GENERADA; i++) clave += caracterAleatorio();
    if (/\d/.test(clave) && /[A-Za-z]/.test(clave)) return clave;
  }
}
