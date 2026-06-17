-- CreateEnum
CREATE TYPE "EstadoTraslado" AS ENUM ('PENDIENTE', 'EN_TRANSITO', 'RECIBIDO', 'ANULADO');

-- CreateTable
CREATE TABLE "traslado" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "numero" TEXT NOT NULL,
    "almacen_origen_id" BIGINT NOT NULL,
    "almacen_destino_id" BIGINT NOT NULL,
    "estado" "EstadoTraslado" NOT NULL DEFAULT 'PENDIENTE',
    "fecha_emision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_despacho" TIMESTAMP(3),
    "fecha_recepcion" TIMESTAMP(3),
    "observaciones" TEXT,
    "usuario_id" BIGINT NOT NULL,

    CONSTRAINT "traslado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traslado_linea" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "traslado_id" BIGINT NOT NULL,
    "sku_id" BIGINT NOT NULL,
    "cantidad" DECIMAL(20,8) NOT NULL,
    "cantidad_despachada" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "cantidad_recibida" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "costo_unitario" DECIMAL(20,8) NOT NULL DEFAULT 0,

    CONSTRAINT "traslado_linea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "traslado_empresa_id_estado_idx" ON "traslado"("empresa_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "traslado_empresa_id_numero_key" ON "traslado"("empresa_id", "numero");

-- CreateIndex
CREATE INDEX "traslado_linea_traslado_id_idx" ON "traslado_linea"("traslado_id");

-- CreateIndex
CREATE INDEX "traslado_linea_empresa_id_sku_id_idx" ON "traslado_linea"("empresa_id", "sku_id");

-- AddForeignKey
ALTER TABLE "traslado_linea" ADD CONSTRAINT "traslado_linea_traslado_id_fkey" FOREIGN KEY ("traslado_id") REFERENCES "traslado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
