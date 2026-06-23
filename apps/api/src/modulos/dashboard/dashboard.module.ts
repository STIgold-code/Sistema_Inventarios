import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { DashboardController } from "./dashboard.controller.js";
import { DashboardService } from "./dashboard.service.js";

/**
 * Modulo de dashboard. Expone un unico endpoint GET /dashboard que agrega los
 * indicadores operativos de la empresa en una sola respuesta.
 */
@Module({
  imports: [AuthModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
