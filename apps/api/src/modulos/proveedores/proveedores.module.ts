import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { ProveedoresController } from "./proveedores.controller.js";
import { ProveedoresService } from "./proveedores.service.js";

@Module({
  imports: [AuthModule],
  controllers: [ProveedoresController],
  providers: [ProveedoresService],
  exports: [ProveedoresService],
})
export class ProveedoresModule {}
