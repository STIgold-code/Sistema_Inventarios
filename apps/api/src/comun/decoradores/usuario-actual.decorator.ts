import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { RequestAutenticado, UsuarioRequest } from "../contexto/usuario-request.js";

/** Inyecta el usuario autenticado del request en un parametro del handler. */
export const UsuarioActual = createParamDecorator(
  (_datos: unknown, ctx: ExecutionContext): UsuarioRequest => {
    const request = ctx.switchToHttp().getRequest<RequestAutenticado>();
    return request.usuario;
  },
);
