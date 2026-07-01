import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import {
  AuthService,
  ResultadoLogin,
  ResultadoRefresco,
} from "./auth.service.js";
import { LoginDto } from "./dto/login.dto.js";
import { RefrescarDto } from "./dto/refrescar.dto.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  login(@Body() dto: LoginDto): Promise<ResultadoLogin> {
    return this.auth.login(dto.email, dto.clave);
  }

  /**
   * Renovacion silenciosa. Publico a proposito: no requiere access token valido
   * (si lo requiriera, no serviria justo cuando el access expiro).
   */
  @Post("refresh")
  @HttpCode(200)
  refrescar(@Body() dto: RefrescarDto): Promise<ResultadoRefresco> {
    return this.auth.refrescar(dto.refreshToken);
  }

  /** Logout: revoca el refresh token entregado. */
  @Post("logout")
  @HttpCode(204)
  async logout(@Body() dto: RefrescarDto): Promise<void> {
    await this.auth.revocar(dto.refreshToken);
  }
}
