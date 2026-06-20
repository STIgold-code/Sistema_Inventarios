import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { TiposCambioController } from "./tipos-cambio.controller.js";
import { TiposCambioService } from "./tipos-cambio.service.js";

@Module({
  imports: [AuthModule],
  controllers: [TiposCambioController],
  providers: [TiposCambioService],
  exports: [TiposCambioService],
})
export class TiposCambioModule {}
