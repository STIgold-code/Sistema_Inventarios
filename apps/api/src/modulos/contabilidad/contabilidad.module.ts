import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { ContabilidadController } from "./contabilidad.controller.js";
import { ContabilidadService } from "./contabilidad.service.js";

@Module({
  imports: [AuthModule],
  controllers: [ContabilidadController],
  providers: [ContabilidadService],
  exports: [ContabilidadService],
})
export class ContabilidadModule {}
