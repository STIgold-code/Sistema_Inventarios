import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { VendedoresController } from "./vendedores.controller.js";
import { VendedoresService } from "./vendedores.service.js";

@Module({
  imports: [AuthModule],
  controllers: [VendedoresController],
  providers: [VendedoresService],
})
export class VendedoresModule {}
