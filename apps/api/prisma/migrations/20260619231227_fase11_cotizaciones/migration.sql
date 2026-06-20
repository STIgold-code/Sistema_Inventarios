-- CreateTable
CREATE TABLE "cotizacion_proveedor" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "proveedor_id" BIGINT NOT NULL,
    "sku_id" BIGINT NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'PEN',
    "precio_unitario" DECIMAL(20,6) NOT NULL,
    "fecha_cotizacion" TIMESTAMP(3) NOT NULL,
    "numero_cotizacion" TEXT,
    "orden_compra_ref" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cotizacion_proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cotizacion_proveedor_empresa_id_sku_id_fecha_cotizacion_idx" ON "cotizacion_proveedor"("empresa_id", "sku_id", "fecha_cotizacion");

-- CreateIndex
CREATE INDEX "cotizacion_proveedor_empresa_id_proveedor_id_sku_id_fecha_c_idx" ON "cotizacion_proveedor"("empresa_id", "proveedor_id", "sku_id", "fecha_cotizacion");

-- AddForeignKey
ALTER TABLE "cotizacion_proveedor" ADD CONSTRAINT "cotizacion_proveedor_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion_proveedor" ADD CONSTRAINT "cotizacion_proveedor_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
