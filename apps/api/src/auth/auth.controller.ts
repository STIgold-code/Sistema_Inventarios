import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { SkipThrottle, Throttle, ThrottlerGuard } from "@nestjs/throttler";
import {
  AuthService,
  ResultadoLogin,
  ResultadoRefresco,
} from "./auth.service.js";
import { LoginDto } from "./dto/login.dto.js";
import { RefrescarDto } from "./dto/refrescar.dto.js";

/**
 * Estos endpoints son publicos (sin JwtGuard), por lo que son el blanco natural
 * de ataques de fuerza bruta y de rellenado de credenciales. Se aplica rate
 * limiting SOLO aqui via ThrottlerGuard a nivel de controller (no como guard
 * global, para no arriesgar el resto de la app). El limite estricto de login y
 * refresh es 10 intentos/min por IP: holgado para un humano o un cliente que
 * reintenta la renovacion, pero corta en seco el barrido automatizado de claves.
 */
const LIMITE_ESTRICTO = { default: { ttl: 60_000, limit: 10 } } as const;

@Controller("auth")
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  @Throttle(LIMITE_ESTRICTO)
  login(@Body() dto: LoginDto): Promise<ResultadoLogin> {
    return this.auth.login(dto.email, dto.clave);
  }

  /**
   * Renovacion silenciosa. Publico a proposito: no requiere access token valido
   * (si lo requiriera, no serviria justo cuando el access expiro).
   */
  @Post("refresh")
  @HttpCode(200)
  @Throttle(LIMITE_ESTRICTO)
  refrescar(@Body() dto: RefrescarDto): Promise<ResultadoRefresco> {
    return this.auth.refrescar(dto.refreshToken);
  }

  /**
   * Logout: revoca el refresh token entregado. Sin throttle propio: es una
   * accion idempotente que solo revoca tokens, no un vector de fuerza bruta.
   */
  @Post("logout")
  @HttpCode(204)
  @SkipThrottle()
  async logout(@Body() dto: RefrescarDto): Promise<void> {
    await this.auth.revocar(dto.refreshToken);
  }
}
