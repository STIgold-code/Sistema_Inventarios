import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { JwtGuard } from "./jwt.guard.js";
import { PermisosGuard } from "./permisos.guard.js";

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("JWT_SECRET"),
        signOptions: { expiresIn: config.get<string>("JWT_EXPIRACION") ?? "8h" },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtGuard, PermisosGuard],
  exports: [AuthService, JwtGuard, PermisosGuard, JwtModule],
})
export class AuthModule {}
