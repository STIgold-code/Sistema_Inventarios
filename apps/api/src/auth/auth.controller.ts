import { Body, Controller, Post } from "@nestjs/common";
import { AuthService, ResultadoLogin } from "./auth.service.js";
import { LoginDto } from "./dto/login.dto.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  login(@Body() dto: LoginDto): Promise<ResultadoLogin> {
    return this.auth.login(dto.email, dto.clave);
  }
}
