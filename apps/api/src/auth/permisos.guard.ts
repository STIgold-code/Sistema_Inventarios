import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { CLAVE_PERMISOS } from "../comun/decoradores/permisos.decorator.js";
import type { RequestAutenticado } from "../comun/contexto/usuario-request.js";

/** Exige que el usuario tenga TODOS los permisos declarados con @Permisos(). */
@Injectable()
export class PermisosGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const requeridos = this.reflector.getAllAndOverride<string[] | undefined>(
      CLAVE_PERMISOS,
      [contexto.getHandler(), contexto.getClass()],
    );
    if (!requeridos || requeridos.length === 0) {
      return true;
    }

    const request = contexto.switchToHttp().getRequest<RequestAutenticado>();
    const concedidos = new Set(request.usuario.permisos);
    const faltante = requeridos.find((p) => !concedidos.has(p));
    if (faltante) {
      throw new ForbiddenException(`Falta el permiso: ${faltante}`);
    }
    return true;
  }
}
