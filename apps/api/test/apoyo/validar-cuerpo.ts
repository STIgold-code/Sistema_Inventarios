import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { OPCIONES_VALIDACION } from "../../src/comun/pipes/opciones-validacion.js";

/** El mismo pipe (y las mismas opciones) que la app registra como global. */
const PIPE = new ValidationPipe(OPCIONES_VALIDACION);

export type ResultadoValidacion<T> =
  | { valido: true; valor: T }
  | { valido: false; mensajes: string[] };

/**
 * Pasa un cuerpo por el ValidationPipe real, como lo haria Nest con `@Body()`:
 * transformacion (incluida la conversion implicita) y validacion.
 */
export async function validarCuerpo<T extends object>(
  clase: new () => T,
  cuerpo: unknown,
): Promise<ResultadoValidacion<T>> {
  try {
    const valor: T = await PIPE.transform(cuerpo, { type: "body", metatype: clase });
    return { valido: true, valor };
  } catch (error) {
    if (!(error instanceof BadRequestException)) throw error;
    const respuesta = error.getResponse();
    const mensaje =
      typeof respuesta === "object" && respuesta !== null && "message" in respuesta
        ? respuesta.message
        : respuesta;
    return { valido: false, mensajes: Array.isArray(mensaje) ? mensaje.map(String) : [String(mensaje)] };
  }
}
