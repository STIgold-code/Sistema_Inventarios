-- AlterTable
ALTER TABLE "capa_costo" ADD COLUMN     "costo_unitario_usd" DECIMAL(20,8);

-- AlterTable
ALTER TABLE "movimiento_stock" ADD COLUMN     "costo_total_usd" DECIMAL(20,2),
ADD COLUMN     "costo_unitario_usd" DECIMAL(20,8);

-- CreateTable
CREATE TABLE "tipo_cambio_diario" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "fecha" DATE NOT NULL,
    "compra" DECIMAL(20,6) NOT NULL,
    "venta" DECIMAL(20,6) NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tipo_cambio_diario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tipo_cambio_diario_empresa_id_fecha_idx" ON "tipo_cambio_diario"("empresa_id", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "tipo_cambio_diario_empresa_id_fecha_key" ON "tipo_cambio_diario"("empresa_id", "fecha");

-- AddForeignKey
ALTER TABLE "tipo_cambio_diario" ADD CONSTRAINT "tipo_cambio_diario_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
