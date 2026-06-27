import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { ParametrosController } from "./parametros.controller.js";
import { ParametrosService } from "./parametros.service.js";

@Module({
  imports: [AuthModule],
  controllers: [ParametrosController],
  providers: [ParametrosService],
  exports: [ParametrosService],
})
export class ParametrosModule {}
