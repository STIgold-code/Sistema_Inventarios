import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { InventarioModule } from "../inventario/inventario.module.js";
import { CorrelativoModule } from "../comun/correlativo/correlativo.module.js";
import { ProveedoresModule } from "../proveedores/proveedores.module.js";
import { ComprasController } from "./compras.controller.js";
import { ComprasService } from "./compras.service.js";

@Module({
  imports: [AuthModule, InventarioModule, CorrelativoModule, ProveedoresModule],
  controllers: [ComprasController],
  providers: [ComprasService],
})
export class ComprasModule {}
