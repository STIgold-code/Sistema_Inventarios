import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { AuditoriaModule } from "../auditoria/auditoria.module.js";
import { CorrelativoModule } from "../comun/correlativo/correlativo.module.js";
import { InventarioModule } from "../inventario/inventario.module.js";
import { ValesModule } from "../vales/vales.module.js";
import { FormulasController } from "./formulas.controller.js";
import { FormulasService } from "./formulas.service.js";
import { OrdenesProduccionController } from "./ordenes-produccion.controller.js";
import { OrdenesProduccionService } from "./ordenes-produccion.service.js";

/** Producción: fórmulas (lista de materiales) y órdenes de producción. */
@Module({
  imports: [AuthModule, AuditoriaModule, CorrelativoModule, InventarioModule, ValesModule],
  controllers: [FormulasController, OrdenesProduccionController],
  providers: [FormulasService, OrdenesProduccionService],
})
export class ProduccionModule {}
