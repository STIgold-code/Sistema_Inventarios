import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { RequestAutenticado } from "../comun/contexto/usuario-request.js";
import { AuthService } from "./auth.service.js";

interface PayloadToken {
  sub: string;
}

/** Verifica el JWT y adjunta el usuario (con permisos) al request. */
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const request = contexto.switchToHttp().getRequest<RequestAutenticado>();
    const token = this.extraerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException("Token no provisto");
    }

    let payload: PayloadToken;
    try {
      payload = await this.jwt.verifyAsync<PayloadToken>(token);
    } catch {
      throw new UnauthorizedException("Token invalido o expirado");
    }

    request.usuario = await this.auth.cargarUsuario(BigInt(payload.sub));
    return true;
  }

  private extraerToken(cabecera: string | undefined): string | null {
    if (!cabecera) return null;
    const [tipo, valor] = cabecera.split(" ");
    return tipo === "Bearer" && valor ? valor : null;
  }
}
