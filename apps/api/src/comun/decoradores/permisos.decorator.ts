import { SetMetadata } from "@nestjs/common";

export const CLAVE_PERMISOS = "permisos_requeridos";

/** Declara los permisos requeridos para acceder a un endpoint. */
export const Permisos = (...permisos: string[]) =>
  SetMetadata(CLAVE_PERMISOS, permisos);
