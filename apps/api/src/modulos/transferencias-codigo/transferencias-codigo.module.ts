import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { AuditoriaModule } from "../auditoria/auditoria.module.js";
import { InventarioModule } from "../inventario/inventario.module.js";
import { TransferenciasCodigoController } from "./transferencias-codigo.controller.js";
import { TransferenciasCodigoService } from "./transferencias-codigo.service.js";

@Module({
  imports: [AuthModule, AuditoriaModule, InventarioModule],
  controllers: [TransferenciasCodigoController],
  providers: [TransferenciasCodigoService],
})
export class TransferenciasCodigoModule {}
