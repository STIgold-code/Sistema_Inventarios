import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { CorrelativoModule } from "../comun/correlativo/correlativo.module.js";
import { OrdenesTrabajoController } from "./ordenes-trabajo.controller.js";
import { OrdenesTrabajoService } from "./ordenes-trabajo.service.js";

@Module({
  imports: [AuthModule, CorrelativoModule],
  controllers: [OrdenesTrabajoController],
  providers: [OrdenesTrabajoService],
})
export class OrdenesTrabajoModule {}
