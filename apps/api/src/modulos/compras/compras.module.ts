import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { AuditoriaModule } from "../auditoria/auditoria.module.js";
import { InventarioModule } from "../inventario/inventario.module.js";
import { CorrelativoModule } from "../comun/correlativo/correlativo.module.js";
import { ProveedoresModule } from "../proveedores/proveedores.module.js";
import { ParametrosModule } from "../parametros/parametros.module.js";
import { ComprasController } from "./compras.controller.js";
import { ComprasService } from "./compras.service.js";

@Module({
  imports: [
    AuthModule,
    AuditoriaModule,
    InventarioModule,
    CorrelativoModule,
    ProveedoresModule,
    ParametrosModule,
  ],
  controllers: [ComprasController],
  providers: [ComprasService],
})
export class ComprasModule {}
