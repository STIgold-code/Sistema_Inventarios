import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { AuditoriaModule } from "../auditoria/auditoria.module.js";
import { InventarioModule } from "../inventario/inventario.module.js";
import { TrasladosController } from "./traslados.controller.js";
import { TrasladosService } from "./traslados.service.js";

@Module({
  imports: [AuthModule, InventarioModule, AuditoriaModule],
  controllers: [TrasladosController],
  providers: [TrasladosService],
})
export class TrasladosModule {}
