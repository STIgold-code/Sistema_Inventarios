import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { InventarioModule } from "../inventario/inventario.module.js";
import { CorrelativoModule } from "../comun/correlativo/correlativo.module.js";
import { ComprasController } from "./compras.controller.js";
import { ComprasService } from "./compras.service.js";

@Module({
  imports: [AuthModule, InventarioModule, CorrelativoModule],
  controllers: [ComprasController],
  providers: [ComprasService],
})
export class ComprasModule {}
