import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { AuditoriaModule } from "../auditoria/auditoria.module.js";
import { TiposCambioModule } from "../tipos-cambio/tipos-cambio.module.js";
import { InventarioController } from "./inventario.controller.js";
import { MovimientoService } from "./movimientos/movimiento.service.js";
import { StockService } from "./stock/stock.service.js";
import { ConteoController } from "./conteos/conteo.controller.js";
import { ConteoService } from "./conteos/conteo.service.js";

@Module({
  imports: [AuthModule, TiposCambioModule, AuditoriaModule],
  controllers: [InventarioController, ConteoController],
  providers: [MovimientoService, StockService, ConteoService],
  exports: [MovimientoService, StockService],
})
export class InventarioModule {}
