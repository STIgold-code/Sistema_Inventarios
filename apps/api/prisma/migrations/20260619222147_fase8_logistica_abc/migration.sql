-- CreateEnum
CREATE TYPE "EstadoOrdenTrabajo" AS ENUM ('ABIERTA', 'CERRADA');

-- AlterTable
ALTER TABLE "sku" ADD COLUMN     "clasificacion_abc" VARCHAR(1),
ADD COLUMN     "punto_reposicion" DECIMAL(20,8),
ADD COLUMN     "semanas_reposicion" INTEGER,
ADD COLUMN     "stock_maximo" DECIMAL(20,8);

-- AlterTable
ALTER TABLE "vale_salida" ADD COLUMN     "orden_trabajo_id" BIGINT;

-- CreateTable
CREATE TABLE "orden_trabajo" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "numero" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "centro_costo_id" BIGINT NOT NULL,
    "estado" "EstadoOrdenTrabajo" NOT NULL DEFAULT 'ABIERTA',
    "fecha_apertura" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_cierre" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orden_trabajo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "orden_trabajo_empresa_id_estado_idx" ON "orden_trabajo"("empresa_id", "estado");

-- CreateIndex
CREATE INDEX "orden_trabajo_empresa_id_centro_costo_id_idx" ON "orden_trabajo"("empresa_id", "centro_costo_id");

-- CreateIndex
CREATE UNIQUE INDEX "orden_trabajo_empresa_id_numero_key" ON "orden_trabajo"("empresa_id", "numero");

-- CreateIndex
CREATE INDEX "vale_salida_empresa_id_orden_trabajo_id_idx" ON "vale_salida"("empresa_id", "orden_trabajo_id");

-- AddForeignKey
ALTER TABLE "vale_salida" ADD CONSTRAINT "vale_salida_orden_trabajo_id_fkey" FOREIGN KEY ("orden_trabajo_id") REFERENCES "orden_trabajo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_trabajo" ADD CONSTRAINT "orden_trabajo_centro_costo_id_fkey" FOREIGN KEY ("centro_costo_id") REFERENCES "centro_costo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
