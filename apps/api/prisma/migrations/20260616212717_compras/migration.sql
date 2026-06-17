-- CreateEnum
CREATE TYPE "EstadoOrdenCompra" AS ENUM ('BORRADOR', 'EMITIDA', 'PARCIAL', 'COMPLETA', 'ANULADA');

-- CreateTable
CREATE TABLE "proveedor" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "ruc" VARCHAR(11) NOT NULL,
    "razon_social" TEXT NOT NULL,
    "direccion" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orden_compra" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "proveedor_id" BIGINT NOT NULL,
    "almacen_id" BIGINT NOT NULL,
    "numero" TEXT NOT NULL,
    "estado" "EstadoOrdenCompra" NOT NULL DEFAULT 'BORRADOR',
    "fecha_emision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "observaciones" TEXT,
    "usuario_id" BIGINT NOT NULL,

    CONSTRAINT "orden_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orden_compra_linea" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "orden_compra_id" BIGINT NOT NULL,
    "sku_id" BIGINT NOT NULL,
    "cantidad" DECIMAL(20,8) NOT NULL,
    "costo_unitario" DECIMAL(20,8) NOT NULL,
    "cantidad_recibida" DECIMAL(20,8) NOT NULL DEFAULT 0,

    CONSTRAINT "orden_compra_linea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recepcion" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "orden_compra_id" BIGINT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipo_documento_sunat" VARCHAR(2) NOT NULL DEFAULT '01',
    "serie_comprobante" TEXT,
    "numero_comprobante" TEXT,
    "usuario_id" BIGINT NOT NULL,

    CONSTRAINT "recepcion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recepcion_linea" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "recepcion_id" BIGINT NOT NULL,
    "orden_compra_linea_id" BIGINT NOT NULL,
    "sku_id" BIGINT NOT NULL,
    "cantidad" DECIMAL(20,8) NOT NULL,
    "movimiento_stock_id" BIGINT NOT NULL,

    CONSTRAINT "recepcion_linea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "proveedor_empresa_id_idx" ON "proveedor"("empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "proveedor_empresa_id_ruc_key" ON "proveedor"("empresa_id", "ruc");

-- CreateIndex
CREATE INDEX "orden_compra_empresa_id_estado_idx" ON "orden_compra"("empresa_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "orden_compra_empresa_id_numero_key" ON "orden_compra"("empresa_id", "numero");

-- CreateIndex
CREATE INDEX "orden_compra_linea_orden_compra_id_idx" ON "orden_compra_linea"("orden_compra_id");

-- CreateIndex
CREATE INDEX "orden_compra_linea_empresa_id_sku_id_idx" ON "orden_compra_linea"("empresa_id", "sku_id");

-- CreateIndex
CREATE INDEX "recepcion_empresa_id_orden_compra_id_idx" ON "recepcion"("empresa_id", "orden_compra_id");

-- CreateIndex
CREATE INDEX "recepcion_linea_recepcion_id_idx" ON "recepcion_linea"("recepcion_id");

-- AddForeignKey
ALTER TABLE "orden_compra" ADD CONSTRAINT "orden_compra_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_compra_linea" ADD CONSTRAINT "orden_compra_linea_orden_compra_id_fkey" FOREIGN KEY ("orden_compra_id") REFERENCES "orden_compra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepcion" ADD CONSTRAINT "recepcion_orden_compra_id_fkey" FOREIGN KEY ("orden_compra_id") REFERENCES "orden_compra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepcion_linea" ADD CONSTRAINT "recepcion_linea_recepcion_id_fkey" FOREIGN KEY ("recepcion_id") REFERENCES "recepcion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
