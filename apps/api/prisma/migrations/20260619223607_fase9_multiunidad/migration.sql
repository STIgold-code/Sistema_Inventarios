-- AlterTable
ALTER TABLE "sku" ADD COLUMN     "factor_conversion" DECIMAL(20,8),
ADD COLUMN     "unidad_referencia_id" BIGINT;

-- AddForeignKey
ALTER TABLE "sku" ADD CONSTRAINT "sku_unidad_referencia_id_fkey" FOREIGN KEY ("unidad_referencia_id") REFERENCES "unidad"("id") ON DELETE SET NULL ON UPDATE CASCADE;
