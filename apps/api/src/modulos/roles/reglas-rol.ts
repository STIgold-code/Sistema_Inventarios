/**
 * Reglas de forma de los roles. Sin dependencias de Nest a proposito: el seed
 * tambien usa {@link CODIGO_ROL_SISTEMA}.
 */

/**
 * Rol del sistema: lo crea el seed con TODOS los permisos y es de solo
 * lectura desde la API (no se edita, no se elimina y su codigo esta reservado).
 */
export const CODIGO_ROL_SISTEMA = "ADMIN";

/** Codigo de rol: 2 a 30 caracteres entre mayusculas, digitos y guion bajo. */
export const REGEX_CODIGO_ROL = /^[A-Z0-9_]{2,30}$/;

export const MENSAJE_CODIGO_ROL =
  "El codigo debe tener de 2 a 30 caracteres: letras mayusculas, digitos o guion bajo";
