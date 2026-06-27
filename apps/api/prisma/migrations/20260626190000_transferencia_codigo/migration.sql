-- Transferencia de codigo: tipos de movimiento, documento, estado, tablas.
ALTER TYPE "TipoMovimiento" ADD VALUE IF NOT EXISTS 'SALIDA_TRANSFORMACION';
ALTER TYPE "TipoMovimiento" ADD VALUE IF NOT EXISTS 'ENTRADA_TRANSFORMACION';
ALTER TYPE "TipoDocumentoOrigen" ADD VALUE IF NOT EXISTS 'TRANSFORMACION';

CREATE TYPE "EstadoTransferenciaCodigo" AS ENUM ('CONFIRMADA', 'ANULADA');

CREATE TABLE "transferencia_codigo" (
  "id" BIGSERIAL PRIMARY KEY,
  "empresa_id" BIGINT NOT NULL,
  "numero" TEXT NOT NULL,
  "almacen_id" BIGINT NOT NULL,
  "estado" "EstadoTransferenciaCodigo" NOT NULL DEFAULT 'CONFIRMADA',
  "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "observaciones" TEXT,
  "usuario_id" BIGINT NOT NULL
);
CREATE UNIQUE INDEX "transferencia_codigo_empresa_id_numero_key" ON "transferencia_codigo"("empresa_id", "numero");
CREATE INDEX "transferencia_codigo_empresa_id_estado_idx" ON "transferencia_codigo"("empresa_id", "estado");

CREATE TABLE "transferencia_codigo_linea" (
  "id" BIGSERIAL PRIMARY KEY,
  "empresa_id" BIGINT NOT NULL,
  "transferencia_id" BIGINT NOT NULL,
  "sku_origen_id" BIGINT NOT NULL,
  "sku_destino_id" BIGINT NOT NULL,
  "cantidad_origen" DECIMAL(20,8) NOT NULL,
  "factor_conversion" DECIMAL(20,8) NOT NULL,
  "cantidad_destino" DECIMAL(20,8) NOT NULL,
  "costo_total" DECIMAL(20,8) NOT NULL DEFAULT 0,
  "movimiento_salida_id" BIGINT,
  "movimiento_entrada_id" BIGINT,
  CONSTRAINT "transferencia_codigo_linea_transferencia_id_fkey" FOREIGN KEY ("transferencia_id") REFERENCES "transferencia_codigo"("id")
);
CREATE INDEX "transferencia_codigo_linea_transferencia_id_idx" ON "transferencia_codigo_linea"("transferencia_id");
CREATE INDEX "transferencia_codigo_linea_empresa_id_sku_origen_id_idx" ON "transferencia_codigo_linea"("empresa_id", "sku_origen_id");
CREATE INDEX "transferencia_codigo_linea_empresa_id_sku_destino_id_idx" ON "transferencia_codigo_linea"("empresa_id", "sku_destino_id");
