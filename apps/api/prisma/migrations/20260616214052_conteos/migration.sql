-- CreateEnum
CREATE TYPE "EstadoConteo" AS ENUM ('ABIERTO', 'APLICADO', 'ANULADO');

-- CreateTable
CREATE TABLE "conteo_fisico" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "almacen_id" BIGINT NOT NULL,
    "estado" "EstadoConteo" NOT NULL DEFAULT 'ABIERTO',
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observaciones" TEXT,
    "usuario_id" BIGINT NOT NULL,

    CONSTRAINT "conteo_fisico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conteo_linea" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "conteo_id" BIGINT NOT NULL,
    "sku_id" BIGINT NOT NULL,
    "cantidad_sistema" DECIMAL(20,8) NOT NULL,
    "cantidad_contada" DECIMAL(20,8) NOT NULL,
    "diferencia" DECIMAL(20,8) NOT NULL,
    "movimiento_ajuste_id" BIGINT,

    CONSTRAINT "conteo_linea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conteo_fisico_empresa_id_estado_idx" ON "conteo_fisico"("empresa_id", "estado");

-- CreateIndex
CREATE INDEX "conteo_linea_conteo_id_idx" ON "conteo_linea"("conteo_id");

-- CreateIndex
CREATE UNIQUE INDEX "conteo_linea_conteo_id_sku_id_key" ON "conteo_linea"("conteo_id", "sku_id");

-- AddForeignKey
ALTER TABLE "conteo_linea" ADD CONSTRAINT "conteo_linea_conteo_id_fkey" FOREIGN KEY ("conteo_id") REFERENCES "conteo_fisico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
