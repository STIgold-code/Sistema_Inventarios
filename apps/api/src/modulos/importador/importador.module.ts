import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { InventarioModule } from "../inventario/inventario.module.js";
import { ImportadorController } from "./importador.controller.js";
import { ImportadorService } from "./importador.service.js";

@Module({
  imports: [AuthModule, InventarioModule],
  controllers: [ImportadorController],
  providers: [ImportadorService],
  exports: [ImportadorService],
})
export class ImportadorModule {}
