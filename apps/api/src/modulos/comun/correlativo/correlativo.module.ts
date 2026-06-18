import { Module } from "@nestjs/common";
import { CorrelativoService } from "./correlativo.service.js";

/**
 * Modulo reutilizable que expone el servicio de correlativos de documento.
 * Importable por cualquier modulo que necesite numerar documentos de forma
 * atomica dentro de una transaccion.
 */
@Module({
  providers: [CorrelativoService],
  exports: [CorrelativoService],
})
export class CorrelativoModule {}
