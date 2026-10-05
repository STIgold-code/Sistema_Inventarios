import { BadRequestException, HttpStatus } from "@nestjs/common";

/**
 * Codigo estable con el que la API rechaza (400) una clave NUEVA que no cumple
 * las reglas. La web lo usa para marcar el error en el campo de la clave en vez
 * de solo mostrar un aviso general. Vive aparte de clave.ts para que ese
 * archivo siga sin dependencias de Nest (lo usan los seeds).
 */
export const CODIGO_CLAVE_INVALIDA = "CLAVE_INVALIDA";

/** 400 con el mensaje de la regla incumplida y `codigo: CLAVE_INVALIDA`. */
export function excepcionClaveInvalida(mensaje: string): BadRequestException {
  return new BadRequestException({
    statusCode: HttpStatus.BAD_REQUEST,
    error: "Bad Request",
    message: mensaje,
    codigo: CODIGO_CLAVE_INVALIDA,
  });
}
