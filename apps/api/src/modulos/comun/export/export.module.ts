import { Module } from "@nestjs/common";
import { ExcelExportService } from "./excel-export.service.js";

/**
 * Modulo reutilizable que expone el servicio de exportacion a Excel de marca BM.
 * Importable por cualquier modulo que necesite generar reportes .xlsx con la
 * identidad visual ejecutiva (logo, colores grafito/dorado, totales).
 */
@Module({
  providers: [ExcelExportService],
  exports: [ExcelExportService],
})
export class ExportModule {}
