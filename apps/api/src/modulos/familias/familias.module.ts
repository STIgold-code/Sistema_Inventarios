import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { FamiliasController } from "./familias.controller.js";
import { FamiliasService } from "./familias.service.js";

@Module({
  imports: [AuthModule],
  controllers: [FamiliasController],
  providers: [FamiliasService],
})
export class FamiliasModule {}
