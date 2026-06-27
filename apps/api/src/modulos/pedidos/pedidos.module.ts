import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { AuditoriaModule } from "../auditoria/auditoria.module.js";
import { ParametrosModule } from "../parametros/parametros.module.js";
import { VentasModule } from "../ventas/ventas.module.js";
import { PedidosController } from "./pedidos.controller.js";
import { PedidosService } from "./pedidos.service.js";

@Module({
  imports: [AuthModule, AuditoriaModule, ParametrosModule, VentasModule],
  controllers: [PedidosController],
  providers: [PedidosService],
})
export class PedidosModule {}
