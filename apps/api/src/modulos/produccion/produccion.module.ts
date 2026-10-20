import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { AuditoriaModule } from "../auditoria/auditoria.module.js";
import { CorrelativoModule } from "../comun/correlativo/correlativo.module.js";
import { InventarioModule } from "../inventario/inventario.module.js";
import { FormulasController } from "./formulas.controller.js";
import { FormulasService } from "./formulas.service.js";

/** Producción: fórmulas (lista de materiales) y órdenes de producción. */
@Module({
  imports: [AuthModule, AuditoriaModule, CorrelativoModule, InventarioModule],
  controllers: [FormulasController],
  providers: [FormulasService],
})
export class ProduccionModule {}
