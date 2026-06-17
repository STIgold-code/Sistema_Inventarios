import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { ActivosController } from "./activos.controller.js";
import { ActivosService } from "./activos.service.js";

@Module({
  imports: [AuthModule],
  controllers: [ActivosController],
  providers: [ActivosService],
})
export class ActivosModule {}
