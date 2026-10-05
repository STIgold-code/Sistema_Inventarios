import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { RequestAutenticado } from "../comun/contexto/usuario-request.js";
import { CLAVE_PERMITIR_CLAVE_TEMPORAL } from "../comun/decoradores/permitir-clave-temporal.decorator.js";
import { AuthService, type PayloadToken } from "./auth.service.js";

/**
 * Codigo estable (legible por maquina) con el que se rechaza a un usuario con
 * clave temporal. La web lo detecta para llevarlo a la pantalla de cambio.
 */
export const CODIGO_CLAVE_TEMPORAL = "CLAVE_TEMPORAL";

/**
 * Verifica el JWT y adjunta el usuario (con permisos) al request. Rechaza con
 * 401 si la version de sesion del token no es la vigente (sesiones revocadas).
 * Si el usuario tiene clave temporal, rechaza con 403 + `codigo: CLAVE_TEMPORAL`
 * salvo en los handlers marcados con @PermitirClaveTemporal().
 */
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const request = contexto.switchToHttp().getRequest<RequestAutenticado>();
    const token = this.extraerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException("Token no provisto");
    }

    // El JWT es de una fuente no confiable hasta compararlo: `ver` puede faltar
    // (tokens anteriores a la version de sesion) y entonces se rechaza.
    let payload: Partial<PayloadToken>;
    try {
      payload = await this.jwt.verifyAsync<Partial<PayloadToken>>(token);
    } catch {
      throw new UnauthorizedException("Token invalido o expirado");
    }

    if (typeof payload.sub !== "string") {
      throw new UnauthorizedException("Token invalido o expirado");
    }

    const usuario = await this.auth.cargarUsuario(BigInt(payload.sub), payload.ver);
    if (usuario.debeCambiarClave && !this.permiteClaveTemporal(contexto)) {
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        error: "Forbidden",
        message: "Debes cambiar tu clave temporal antes de continuar",
        codigo: CODIGO_CLAVE_TEMPORAL,
      });
    }

    request.usuario = usuario;
    return true;
  }

  /**
   * Solo se honra a nivel de HANDLER: la marca puesta en una clase no exime a
   * todos sus endpoints (evita abrir un controlador entero por error).
   */
  private permiteClaveTemporal(contexto: ExecutionContext): boolean {
    return (
      this.reflector.get<boolean | undefined>(
        CLAVE_PERMITIR_CLAVE_TEMPORAL,
        contexto.getHandler(),
      ) === true
    );
  }

  private extraerToken(cabecera: string | undefined): string | null {
    if (!cabecera) return null;
    const [tipo, valor] = cabecera.split(" ");
    return tipo === "Bearer" && valor ? valor : null;
  }
}
