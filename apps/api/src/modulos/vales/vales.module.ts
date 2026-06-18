import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { CorrelativoModule } from "../comun/correlativo/correlativo.module.js";
import { InventarioModule } from "../inventario/inventario.module.js";
import { ValesController } from "./vales.controller.js";
import { ValesService } from "./vales.service.js";

@Module({
  imports: [AuthModule, CorrelativoModule, InventarioModule],
  controllers: [ValesController],
  providers: [ValesService],
})
export class ValesModule {}
