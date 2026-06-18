import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { CorrelativoModule } from "../comun/correlativo/correlativo.module.js";
import { RequerimientosController } from "./requerimientos.controller.js";
import { RequerimientosService } from "./requerimientos.service.js";

@Module({
  imports: [AuthModule, CorrelativoModule],
  controllers: [RequerimientosController],
  providers: [RequerimientosService],
})
export class RequerimientosModule {}
