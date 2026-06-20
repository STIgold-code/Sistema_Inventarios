-- CreateEnum
CREATE TYPE "EstadoDevolucionVenta" AS ENUM ('REGISTRADA', 'ANULADA');

-- AlterEnum
ALTER TYPE "TipoDocumentoOrigen" ADD VALUE 'DEVOLUCION_VENTA';

-- CreateTable
CREATE TABLE "devolucion_venta" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "almacen_id" BIGINT NOT NULL,
    "orden_venta_id" BIGINT NOT NULL,
    "comprobante_venta_id" BIGINT,
    "guia_remision_id" BIGINT,
    "numero" TEXT NOT NULL,
    "estado" "EstadoDevolucionVenta" NOT NULL DEFAULT 'REGISTRADA',
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "motivo" TEXT,
    "usuario_id" BIGINT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devolucion_venta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devolucion_venta_linea" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "devolucion_id" BIGINT NOT NULL,
    "orden_venta_linea_id" BIGINT,
    "sku_id" BIGINT NOT NULL,
    "cantidad" DECIMAL(20,8) NOT NULL,
    "motivo" TEXT,
    "costo_unitario" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "movimiento_entrada_id" BIGINT,

    CONSTRAINT "devolucion_venta_linea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "devolucion_venta_empresa_id_orden_venta_id_idx" ON "devolucion_venta"("empresa_id", "orden_venta_id");

-- CreateIndex
CREATE UNIQUE INDEX "devolucion_venta_empresa_id_numero_key" ON "devolucion_venta"("empresa_id", "numero");

-- CreateIndex
CREATE INDEX "devolucion_venta_linea_devolucion_id_idx" ON "devolucion_venta_linea"("devolucion_id");

-- CreateIndex
CREATE INDEX "devolucion_venta_linea_empresa_id_sku_id_idx" ON "devolucion_venta_linea"("empresa_id", "sku_id");

-- AddForeignKey
ALTER TABLE "devolucion_venta" ADD CONSTRAINT "devolucion_venta_orden_venta_id_fkey" FOREIGN KEY ("orden_venta_id") REFERENCES "orden_venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devolucion_venta" ADD CONSTRAINT "devolucion_venta_comprobante_venta_id_fkey" FOREIGN KEY ("comprobante_venta_id") REFERENCES "comprobante_venta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devolucion_venta" ADD CONSTRAINT "devolucion_venta_guia_remision_id_fkey" FOREIGN KEY ("guia_remision_id") REFERENCES "guia_remision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devolucion_venta_linea" ADD CONSTRAINT "devolucion_venta_linea_devolucion_id_fkey" FOREIGN KEY ("devolucion_id") REFERENCES "devolucion_venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
