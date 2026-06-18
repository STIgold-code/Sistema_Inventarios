import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { CentrosCostoController } from "./centros-costo.controller.js";
import { CentrosCostoService } from "./centros-costo.service.js";

@Module({
  imports: [AuthModule],
  controllers: [CentrosCostoController],
  providers: [CentrosCostoService],
})
export class CentrosCostoModule {}
