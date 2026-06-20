-- AlterTable
ALTER TABLE "cliente" ADD COLUMN     "tipo_precio" INTEGER;

-- AlterTable
ALTER TABLE "sku" ADD COLUMN     "moneda_venta" VARCHAR(3),
ADD COLUMN     "precio_distribuidor" DECIMAL(20,6),
ADD COLUMN     "precio_publico" DECIMAL(20,6),
ADD COLUMN     "precio_venta_3" DECIMAL(20,6),
ADD COLUMN     "precio_venta_4" DECIMAL(20,6);
