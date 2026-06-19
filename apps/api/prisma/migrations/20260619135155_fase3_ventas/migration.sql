-- AlterTable
ALTER TABLE "orden_venta" ADD COLUMN     "cliente_id" BIGINT,
ADD COLUMN     "igv" DECIMAL(20,2) NOT NULL DEFAULT 0,
ADD COLUMN     "moneda" TEXT NOT NULL DEFAULT 'PEN',
ADD COLUMN     "subtotal" DECIMAL(20,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tipo_cambio" DECIMAL(20,6);

-- CreateTable
CREATE TABLE "cliente" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "tipo_doc_identidad" VARCHAR(2) NOT NULL DEFAULT '6',
    "numero_doc" TEXT NOT NULL,
    "razon_social" TEXT NOT NULL,
    "direccion" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comprobante_venta" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "orden_venta_id" BIGINT NOT NULL,
    "cliente_id" BIGINT NOT NULL,
    "tipo_documento_sunat" VARCHAR(2) NOT NULL,
    "serie" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "fecha_emision" TIMESTAMP(3) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'PEN',
    "tipo_cambio" DECIMAL(20,6),
    "subtotal" DECIMAL(20,2) NOT NULL,
    "igv" DECIMAL(20,2) NOT NULL,
    "total" DECIMAL(20,2) NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comprobante_venta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cliente_empresa_id_idx" ON "cliente"("empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "cliente_empresa_id_numero_doc_key" ON "cliente"("empresa_id", "numero_doc");

-- CreateIndex
CREATE INDEX "comprobante_venta_empresa_id_orden_venta_id_idx" ON "comprobante_venta"("empresa_id", "orden_venta_id");

-- CreateIndex
CREATE UNIQUE INDEX "comprobante_venta_empresa_id_tipo_documento_sunat_serie_num_key" ON "comprobante_venta"("empresa_id", "tipo_documento_sunat", "serie", "numero");

-- AddForeignKey
ALTER TABLE "cliente" ADD CONSTRAINT "cliente_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_venta" ADD CONSTRAINT "orden_venta_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobante_venta" ADD CONSTRAINT "comprobante_venta_orden_venta_id_fkey" FOREIGN KEY ("orden_venta_id") REFERENCES "orden_venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobante_venta" ADD CONSTRAINT "comprobante_venta_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
