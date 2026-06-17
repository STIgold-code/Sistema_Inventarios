import type { Request } from "express";

/** Identidad del usuario autenticado, adjuntada al request por el JwtGuard. */
export interface UsuarioRequest {
  id: bigint;
  empresaId: bigint;
  email: string;
  nombre: string;
  permisos: string[];
}

/** Request de Express con el usuario autenticado adjunto. */
export interface RequestAutenticado extends Request {
  usuario: UsuarioRequest;
}
