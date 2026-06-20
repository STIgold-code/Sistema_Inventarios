import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { CotizacionesController } from "./cotizaciones.controller.js";
import { CotizacionesService } from "./cotizaciones.service.js";

@Module({
  imports: [AuthModule],
  controllers: [CotizacionesController],
  providers: [CotizacionesService],
})
export class CotizacionesModule {}
