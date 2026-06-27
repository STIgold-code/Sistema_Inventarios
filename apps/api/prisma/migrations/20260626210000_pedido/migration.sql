-- Pedido de venta (documento previo a la orden/despacho).
CREATE TYPE "EstadoPedido" AS ENUM ('BORRADOR', 'APROBADO', 'ATENDIDO_PARCIAL', 'ATENDIDO', 'ANULADO');

CREATE TABLE "pedido" (
  "id" BIGSERIAL PRIMARY KEY,
  "empresa_id" BIGINT NOT NULL,
  "almacen_id" BIGINT NOT NULL,
  "cliente_id" BIGINT,
  "vendedor_id" BIGINT,
  "numero" TEXT NOT NULL,
  "estado" "EstadoPedido" NOT NULL DEFAULT 'BORRADOR',
  "fecha_emision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fecha_entrega" TIMESTAMP(3),
  "moneda" TEXT NOT NULL DEFAULT 'PEN',
  "tipo_cambio" DECIMAL(20,6),
  "subtotal" DECIMAL(20,2) NOT NULL DEFAULT 0,
  "igv" DECIMAL(20,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(20,2) NOT NULL DEFAULT 0,
  "observaciones" TEXT,
  "usuario_id" BIGINT NOT NULL,
  "aprobado_por_id" BIGINT,
  "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizado_en" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "pedido_empresa_id_numero_key" ON "pedido"("empresa_id", "numero");
CREATE INDEX "pedido_empresa_id_estado_idx" ON "pedido"("empresa_id", "estado");

CREATE TABLE "pedido_linea" (
  "id" BIGSERIAL PRIMARY KEY,
  "empresa_id" BIGINT NOT NULL,
  "pedido_id" BIGINT NOT NULL,
  "sku_id" BIGINT NOT NULL,
  "cantidad" DECIMAL(20,8) NOT NULL,
  "cantidad_atendida" DECIMAL(20,8) NOT NULL DEFAULT 0,
  "precio_unitario" DECIMAL(20,8) NOT NULL DEFAULT 0,
  CONSTRAINT "pedido_linea_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedido"("id")
);
CREATE INDEX "pedido_linea_pedido_id_idx" ON "pedido_linea"("pedido_id");
CREATE INDEX "pedido_linea_empresa_id_sku_id_idx" ON "pedido_linea"("empresa_id", "sku_id");
