-- CreateEnum
CREATE TYPE "EstadoOrdenVenta" AS ENUM ('PENDIENTE', 'PARCIAL', 'DESPACHADA', 'ANULADA');

-- CreateTable
CREATE TABLE "orden_venta" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "almacen_id" BIGINT NOT NULL,
    "numero" TEXT NOT NULL,
    "cliente" TEXT,
    "estado" "EstadoOrdenVenta" NOT NULL DEFAULT 'PENDIENTE',
    "fecha_emision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "observaciones" TEXT,
    "usuario_id" BIGINT NOT NULL,

    CONSTRAINT "orden_venta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orden_venta_linea" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "orden_venta_id" BIGINT NOT NULL,
    "sku_id" BIGINT NOT NULL,
    "cantidad" DECIMAL(20,8) NOT NULL,
    "precio_unitario" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "cantidad_despachada" DECIMAL(20,8) NOT NULL DEFAULT 0,

    CONSTRAINT "orden_venta_linea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "orden_venta_empresa_id_estado_idx" ON "orden_venta"("empresa_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "orden_venta_empresa_id_numero_key" ON "orden_venta"("empresa_id", "numero");

-- CreateIndex
CREATE INDEX "orden_venta_linea_orden_venta_id_idx" ON "orden_venta_linea"("orden_venta_id");

-- CreateIndex
CREATE INDEX "orden_venta_linea_empresa_id_sku_id_idx" ON "orden_venta_linea"("empresa_id", "sku_id");

-- AddForeignKey
ALTER TABLE "orden_venta_linea" ADD CONSTRAINT "orden_venta_linea_orden_venta_id_fkey" FOREIGN KEY ("orden_venta_id") REFERENCES "orden_venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
