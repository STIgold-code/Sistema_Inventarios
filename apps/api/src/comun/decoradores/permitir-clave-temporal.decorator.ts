import { SetMetadata } from "@nestjs/common";

export const CLAVE_PERMITIR_CLAVE_TEMPORAL = "permitir_clave_temporal";

/**
 * Exime al handler del bloqueo por clave temporal del JwtGuard. Usar SOLO en
 * lo que el flujo de cambio obligatorio necesita (p. ej. cambiar la clave).
 * Es un decorador de METODO: el guard ignora la marca a nivel de clase.
 */
export const PermitirClaveTemporal = (): MethodDecorator =>
  SetMetadata(CLAVE_PERMITIR_CLAVE_TEMPORAL, true);
