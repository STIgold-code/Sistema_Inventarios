-- DropIndex
DROP INDEX "ubicacion_almacen_id_codigo_key";

-- AlterTable
ALTER TABLE "ubicacion" ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "nombre" TEXT NOT NULL DEFAULT '';

-- Remove the temporary default once column exists (nombre is required going forward)
ALTER TABLE "ubicacion" ALTER COLUMN "nombre" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "ubicacion_empresa_id_almacen_id_codigo_key" ON "ubicacion"("empresa_id", "almacen_id", "codigo");

-- AddForeignKey
ALTER TABLE "item_stock" ADD CONSTRAINT "item_stock_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "ubicacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
