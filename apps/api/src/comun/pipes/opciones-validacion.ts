import type { ValidationPipeOptions } from "@nestjs/common";

/**
 * Opciones del ValidationPipe global. Viven aqui (y no en main.ts) para que
 * los tests de DTOs validen exactamente con la misma configuracion que la app.
 * Los campos desconocidos se descartan (whitelist), sin rechazar la peticion.
 */
export const OPCIONES_VALIDACION: ValidationPipeOptions = {
  whitelist: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
};
