import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { AuditoriaController } from "./auditoria.controller.js";
import { AuditoriaService } from "./auditoria.service.js";

/**
 * Modulo de auditoria. Exporta `AuditoriaService` para que otros modulos lo
 * inyecten y registren acciones de gobierno en la bitacora.
 */
@Module({
  imports: [AuthModule],
  controllers: [AuditoriaController],
  providers: [AuditoriaService],
  exports: [AuditoriaService],
})
export class AuditoriaModule {}
