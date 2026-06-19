import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { GuiasController } from "./guias.controller.js";
import { GuiasService } from "./guias.service.js";

@Module({
  imports: [AuthModule],
  controllers: [GuiasController],
  providers: [GuiasService],
})
export class GuiasModule {}
