import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { ExportModule } from "../comun/export/export.module.js";
import { ReportesController } from "./reportes.controller.js";
import { ReportesService } from "./reportes.service.js";

@Module({
  imports: [AuthModule, ExportModule],
  controllers: [ReportesController],
  providers: [ReportesService],
  exports: [ReportesService],
})
export class ReportesModule {}
