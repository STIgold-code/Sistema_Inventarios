import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { AuditoriaModule } from "../auditoria/auditoria.module.js";
import { CorrelativoModule } from "../comun/correlativo/correlativo.module.js";
import { InventarioModule } from "../inventario/inventario.module.js";
import { DevolucionesProveedorController } from "./devoluciones-proveedor.controller.js";
import { DevolucionesProveedorService } from "./devoluciones-proveedor.service.js";

@Module({
  imports: [AuthModule, AuditoriaModule, CorrelativoModule, InventarioModule],
  controllers: [DevolucionesProveedorController],
  providers: [DevolucionesProveedorService],
})
export class DevolucionesProveedorModule {}
