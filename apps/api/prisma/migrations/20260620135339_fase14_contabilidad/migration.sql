-- CreateEnum
CREATE TYPE "ConceptoContable" AS ENUM ('COSTO_VENTA', 'CONSUMO', 'COMPRA', 'DEVOLUCION');

-- CreateTable
CREATE TABLE "cuenta_contable_config" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "concepto" "ConceptoContable" NOT NULL,
    "cuenta_debe" TEXT NOT NULL,
    "cuenta_haber" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cuenta_contable_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cuenta_contable_config_empresa_id_idx" ON "cuenta_contable_config"("empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "cuenta_contable_config_empresa_id_concepto_key" ON "cuenta_contable_config"("empresa_id", "concepto");

-- AddForeignKey
ALTER TABLE "cuenta_contable_config" ADD CONSTRAINT "cuenta_contable_config_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
