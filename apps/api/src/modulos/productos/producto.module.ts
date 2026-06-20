import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { ReportesModule } from "../reportes/reportes.module.js";
import { ProductoController } from "./producto.controller.js";
import { ProductoService } from "./producto.service.js";

@Module({
  imports: [AuthModule, ReportesModule],
  controllers: [ProductoController],
  providers: [ProductoService],
  exports: [ProductoService],
})
export class ProductoModule {}
