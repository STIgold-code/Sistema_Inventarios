/*
  Warnings:

  - Added the required column `fecha_emision_documento` to the `recepcion` table without a default value. This is not possible if the table is not empty.
  - Added the required column `igv` to the `recepcion` table without a default value. This is not possible if the table is not empty.
  - Added the required column `subtotal` to the `recepcion` table without a default value. This is not possible if the table is not empty.
  - Added the required column `total` to the `recepcion` table without a default value. This is not possible if the table is not empty.
  - Made the column `serie_comprobante` on table `recepcion` required. This step will fail if there are existing NULL values in that column.
  - Made the column `numero_comprobante` on table `recepcion` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "EstadoRequerimiento" AS ENUM ('BORRADOR', 'APROBADO', 'RECHAZADO', 'CONVERTIDO');

-- AlterTable
ALTER TABLE "orden_compra" ADD COLUMN     "aprobado_por_id" BIGINT,
ADD COLUMN     "igv" DECIMAL(20,2) NOT NULL DEFAULT 0,
ADD COLUMN     "moneda" TEXT NOT NULL DEFAULT 'PEN',
ADD COLUMN     "requerimiento_id" BIGINT,
ADD COLUMN     "subtotal" DECIMAL(20,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tipo_cambio" DECIMAL(20,6);

-- AlterTable
ALTER TABLE "proveedor" ADD COLUMN     "cci" TEXT,
ADD COLUMN     "condicion_pago" TEXT,
ADD COLUMN     "contacto_nombre" TEXT,
ADD COLUMN     "moneda_habitual" TEXT NOT NULL DEFAULT 'PEN',
ADD COLUMN     "tipo_doc_identidad" VARCHAR(2) NOT NULL DEFAULT '6';

-- AlterTable
-- Las columnas requeridas se agregan con DEFAULT temporal para rellenar las
-- 21 filas historicas (recepciones previas sin factura capturada), luego se
-- retira el default para que las nuevas filas exijan el valor desde la app.
ALTER TABLE "recepcion" ADD COLUMN     "fecha_emision_documento" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "guia_remision_proveedor" TEXT,
ADD COLUMN     "igv" DECIMAL(20,2) NOT NULL DEFAULT 0,
ADD COLUMN     "moneda" TEXT NOT NULL DEFAULT 'PEN',
ADD COLUMN     "subtotal" DECIMAL(20,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tipo_cambio" DECIMAL(20,6),
ADD COLUMN     "total" DECIMAL(20,2) NOT NULL DEFAULT 0;

-- Relleno de serie/numero en filas historicas con NULL antes del SET NOT NULL.
UPDATE "recepcion" SET "serie_comprobante" = '0' WHERE "serie_comprobante" IS NULL;
UPDATE "recepcion" SET "numero_comprobante" = '0' WHERE "numero_comprobante" IS NULL;

ALTER TABLE "recepcion" ALTER COLUMN "serie_comprobante" SET NOT NULL,
ALTER COLUMN "numero_comprobante" SET NOT NULL;

-- Retirar los DEFAULT temporales: la aplicacion siempre provee estos valores.
ALTER TABLE "recepcion" ALTER COLUMN "fecha_emision_documento" DROP DEFAULT,
ALTER COLUMN "igv" DROP DEFAULT,
ALTER COLUMN "subtotal" DROP DEFAULT,
ALTER COLUMN "total" DROP DEFAULT;

-- CreateTable
CREATE TABLE "requerimiento_compra" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "numero" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "centro_costo_id" BIGINT NOT NULL,
    "solicitante_id" BIGINT NOT NULL,
    "estado" "EstadoRequerimiento" NOT NULL DEFAULT 'BORRADOR',
    "aprobado_por_id" BIGINT,
    "observaciones" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requerimiento_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requerimiento_compra_linea" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "requerimiento_id" BIGINT NOT NULL,
    "sku_id" BIGINT NOT NULL,
    "cantidad" DECIMAL(20,8) NOT NULL,
    "justificacion" TEXT,

    CONSTRAINT "requerimiento_compra_linea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "requerimiento_compra_empresa_id_estado_idx" ON "requerimiento_compra"("empresa_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "requerimiento_compra_empresa_id_numero_key" ON "requerimiento_compra"("empresa_id", "numero");

-- CreateIndex
CREATE INDEX "requerimiento_compra_linea_requerimiento_id_idx" ON "requerimiento_compra_linea"("requerimiento_id");

-- CreateIndex
CREATE INDEX "requerimiento_compra_linea_empresa_id_sku_id_idx" ON "requerimiento_compra_linea"("empresa_id", "sku_id");

-- AddForeignKey
ALTER TABLE "requerimiento_compra" ADD CONSTRAINT "requerimiento_compra_centro_costo_id_fkey" FOREIGN KEY ("centro_costo_id") REFERENCES "centro_costo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requerimiento_compra" ADD CONSTRAINT "requerimiento_compra_solicitante_id_fkey" FOREIGN KEY ("solicitante_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requerimiento_compra" ADD CONSTRAINT "requerimiento_compra_aprobado_por_id_fkey" FOREIGN KEY ("aprobado_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requerimiento_compra_linea" ADD CONSTRAINT "requerimiento_compra_linea_requerimiento_id_fkey" FOREIGN KEY ("requerimiento_id") REFERENCES "requerimiento_compra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_compra" ADD CONSTRAINT "orden_compra_requerimiento_id_fkey" FOREIGN KEY ("requerimiento_id") REFERENCES "requerimiento_compra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_compra" ADD CONSTRAINT "orden_compra_aprobado_por_id_fkey" FOREIGN KEY ("aprobado_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
