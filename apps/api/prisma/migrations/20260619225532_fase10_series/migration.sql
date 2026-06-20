-- CreateEnum
CREATE TYPE "EstadoSerieArticulo" AS ENUM ('DISPONIBLE', 'DESPACHADO');

-- CreateTable
CREATE TABLE "serie_articulo" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "sku_id" BIGINT NOT NULL,
    "numero_serie" TEXT NOT NULL,
    "almacen_id" BIGINT,
    "estado" "EstadoSerieArticulo" NOT NULL DEFAULT 'DISPONIBLE',
    "movimiento_entrada_id" BIGINT,
    "movimiento_salida_id" BIGINT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "serie_articulo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "serie_articulo_empresa_id_sku_id_estado_idx" ON "serie_articulo"("empresa_id", "sku_id", "estado");

-- CreateIndex
CREATE INDEX "serie_articulo_empresa_id_almacen_id_idx" ON "serie_articulo"("empresa_id", "almacen_id");

-- CreateIndex
CREATE UNIQUE INDEX "serie_articulo_empresa_id_sku_id_numero_serie_key" ON "serie_articulo"("empresa_id", "sku_id", "numero_serie");

-- AddForeignKey
ALTER TABLE "serie_articulo" ADD CONSTRAINT "serie_articulo_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "serie_articulo" ADD CONSTRAINT "serie_articulo_almacen_id_fkey" FOREIGN KEY ("almacen_id") REFERENCES "almacen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "serie_articulo" ADD CONSTRAINT "serie_articulo_movimiento_entrada_id_fkey" FOREIGN KEY ("movimiento_entrada_id") REFERENCES "movimiento_stock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "serie_articulo" ADD CONSTRAINT "serie_articulo_movimiento_salida_id_fkey" FOREIGN KEY ("movimiento_salida_id") REFERENCES "movimiento_stock"("id") ON DELETE SET NULL ON UPDATE CASCADE;
