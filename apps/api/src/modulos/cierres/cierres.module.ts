import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { AuditoriaModule } from "../auditoria/auditoria.module.js";
import { CierresController } from "./cierres.controller.js";
import { CierresService } from "./cierres.service.js";

@Module({
  imports: [AuthModule, AuditoriaModule],
  controllers: [CierresController],
  providers: [CierresService],
})
export class CierresModule {}
