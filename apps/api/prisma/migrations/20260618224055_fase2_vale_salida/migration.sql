-- CreateEnum
CREATE TYPE "EstadoValeSalida" AS ENUM ('BORRADOR', 'AUTORIZADO', 'DESPACHADO', 'ANULADO');

-- AlterEnum
ALTER TYPE "TipoDocumentoOrigen" ADD VALUE 'VALE_SALIDA';

-- AlterEnum
ALTER TYPE "TipoMovimiento" ADD VALUE 'SALIDA_CONSUMO';

-- CreateTable
CREATE TABLE "vale_salida" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "numero" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "almacen_id" BIGINT NOT NULL,
    "centro_costo_id" BIGINT NOT NULL,
    "solicitante_id" BIGINT NOT NULL,
    "autorizado_por_id" BIGINT,
    "destino" TEXT NOT NULL,
    "estado" "EstadoValeSalida" NOT NULL DEFAULT 'BORRADOR',
    "observaciones" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vale_salida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vale_salida_linea" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "vale_salida_id" BIGINT NOT NULL,
    "sku_id" BIGINT NOT NULL,
    "cantidad" DECIMAL(20,8) NOT NULL,
    "cantidad_despachada" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "observacion" TEXT,
    "movimiento_stock_id" BIGINT,

    CONSTRAINT "vale_salida_linea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vale_salida_empresa_id_estado_idx" ON "vale_salida"("empresa_id", "estado");

-- CreateIndex
CREATE INDEX "vale_salida_empresa_id_almacen_id_idx" ON "vale_salida"("empresa_id", "almacen_id");

-- CreateIndex
CREATE UNIQUE INDEX "vale_salida_empresa_id_numero_key" ON "vale_salida"("empresa_id", "numero");

-- CreateIndex
CREATE INDEX "vale_salida_linea_vale_salida_id_idx" ON "vale_salida_linea"("vale_salida_id");

-- CreateIndex
CREATE INDEX "vale_salida_linea_empresa_id_sku_id_idx" ON "vale_salida_linea"("empresa_id", "sku_id");

-- AddForeignKey
ALTER TABLE "vale_salida" ADD CONSTRAINT "vale_salida_almacen_id_fkey" FOREIGN KEY ("almacen_id") REFERENCES "almacen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vale_salida" ADD CONSTRAINT "vale_salida_centro_costo_id_fkey" FOREIGN KEY ("centro_costo_id") REFERENCES "centro_costo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vale_salida" ADD CONSTRAINT "vale_salida_solicitante_id_fkey" FOREIGN KEY ("solicitante_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vale_salida" ADD CONSTRAINT "vale_salida_autorizado_por_id_fkey" FOREIGN KEY ("autorizado_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vale_salida_linea" ADD CONSTRAINT "vale_salida_linea_vale_salida_id_fkey" FOREIGN KEY ("vale_salida_id") REFERENCES "vale_salida"("id") ON DELETE CASCADE ON UPDATE CASCADE;
