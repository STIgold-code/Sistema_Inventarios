-- Devolucion al proveedor: tipo de movimiento, documento, estado, tablas.
ALTER TYPE "TipoMovimiento" ADD VALUE IF NOT EXISTS 'SALIDA_DEVOLUCION_PROVEEDOR';
ALTER TYPE "TipoDocumentoOrigen" ADD VALUE IF NOT EXISTS 'DEVOLUCION_PROVEEDOR';

CREATE TYPE "EstadoDevolucionProveedor" AS ENUM ('REGISTRADA', 'ANULADA');

CREATE TABLE "devolucion_proveedor" (
  "id" BIGSERIAL PRIMARY KEY,
  "empresa_id" BIGINT NOT NULL,
  "almacen_id" BIGINT NOT NULL,
  "orden_compra_id" BIGINT NOT NULL,
  "recepcion_id" BIGINT NOT NULL,
  "numero" TEXT NOT NULL,
  "estado" "EstadoDevolucionProveedor" NOT NULL DEFAULT 'REGISTRADA',
  "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "motivo" TEXT,
  "tipo_comprobante" TEXT,
  "serie_comprobante" TEXT,
  "numero_comprobante" TEXT,
  "fecha_comprobante" TIMESTAMP(3),
  "usuario_id" BIGINT NOT NULL,
  "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devolucion_proveedor_orden_compra_id_fkey" FOREIGN KEY ("orden_compra_id") REFERENCES "orden_compra"("id"),
  CONSTRAINT "devolucion_proveedor_recepcion_id_fkey" FOREIGN KEY ("recepcion_id") REFERENCES "recepcion"("id")
);
CREATE UNIQUE INDEX "devolucion_proveedor_empresa_id_numero_key" ON "devolucion_proveedor"("empresa_id", "numero");
CREATE INDEX "devolucion_proveedor_empresa_id_recepcion_id_idx" ON "devolucion_proveedor"("empresa_id", "recepcion_id");

CREATE TABLE "devolucion_proveedor_linea" (
  "id" BIGSERIAL PRIMARY KEY,
  "empresa_id" BIGINT NOT NULL,
  "devolucion_id" BIGINT NOT NULL,
  "recepcion_linea_id" BIGINT,
  "sku_id" BIGINT NOT NULL,
  "cantidad" DECIMAL(20,8) NOT NULL,
  "motivo" TEXT,
  "costo_unitario" DECIMAL(20,8) NOT NULL DEFAULT 0,
  "movimiento_salida_id" BIGINT,
  CONSTRAINT "devolucion_proveedor_linea_devolucion_id_fkey" FOREIGN KEY ("devolucion_id") REFERENCES "devolucion_proveedor"("id")
);
CREATE INDEX "devolucion_proveedor_linea_devolucion_id_idx" ON "devolucion_proveedor_linea"("devolucion_id");
CREATE INDEX "devolucion_proveedor_linea_empresa_id_sku_id_idx" ON "devolucion_proveedor_linea"("empresa_id", "sku_id");
