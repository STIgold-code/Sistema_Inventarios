import type { Request } from "express";

/** Identidad del usuario autenticado, adjuntada al request por el JwtGuard. */
export interface UsuarioRequest {
  id: bigint;
  empresaId: bigint;
  email: string;
  nombre: string;
  permisos: string[];
  /** true mientras la clave vigente sea temporal (fijada por un tercero). */
  debeCambiarClave: boolean;
}

/** Request de Express con el usuario autenticado adjunto. */
export interface RequestAutenticado extends Request {
  usuario: UsuarioRequest;
}
