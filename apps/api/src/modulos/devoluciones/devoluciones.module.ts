import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { AuditoriaModule } from "../auditoria/auditoria.module.js";
import { CorrelativoModule } from "../comun/correlativo/correlativo.module.js";
import { InventarioModule } from "../inventario/inventario.module.js";
import { DevolucionesController } from "./devoluciones.controller.js";
import { DevolucionesService } from "./devoluciones.service.js";

@Module({
  imports: [AuthModule, AuditoriaModule, CorrelativoModule, InventarioModule],
  controllers: [DevolucionesController],
  providers: [DevolucionesService],
})
export class DevolucionesModule {}
