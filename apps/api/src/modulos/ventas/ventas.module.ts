import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { AuditoriaModule } from "../auditoria/auditoria.module.js";
import { InventarioModule } from "../inventario/inventario.module.js";
import { ParametrosModule } from "../parametros/parametros.module.js";
import { VentasController } from "./ventas.controller.js";
import { VentasService } from "./ventas.service.js";

@Module({
  imports: [AuthModule, AuditoriaModule, InventarioModule, ParametrosModule],
  controllers: [VentasController],
  providers: [VentasService],
  exports: [VentasService],
})
export class VentasModule {}
