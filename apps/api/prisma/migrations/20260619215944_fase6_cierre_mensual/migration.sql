-- CreateEnum
CREATE TYPE "EstadoCierrePeriodo" AS ENUM ('ABIERTO', 'CERRADO');

-- CreateTable
CREATE TABLE "cierre_periodo" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "periodo" VARCHAR(6) NOT NULL,
    "estado" "EstadoCierrePeriodo" NOT NULL DEFAULT 'ABIERTO',
    "cerrado_por_id" BIGINT,
    "fecha_cierre" TIMESTAMP(3),
    "total_valorizado_soles" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "total_valorizado_usd" DECIMAL(20,2),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cierre_periodo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saldo_periodo" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "cierre_id" BIGINT NOT NULL,
    "periodo" VARCHAR(6) NOT NULL,
    "sku_id" BIGINT NOT NULL,
    "almacen_id" BIGINT NOT NULL,
    "cantidad" DECIMAL(20,8) NOT NULL,
    "costo_soles" DECIMAL(20,2) NOT NULL,
    "costo_usd" DECIMAL(20,2),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saldo_periodo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cierre_periodo_empresa_id_estado_idx" ON "cierre_periodo"("empresa_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "cierre_periodo_empresa_id_periodo_key" ON "cierre_periodo"("empresa_id", "periodo");

-- CreateIndex
CREATE INDEX "saldo_periodo_empresa_id_periodo_idx" ON "saldo_periodo"("empresa_id", "periodo");

-- CreateIndex
CREATE UNIQUE INDEX "saldo_periodo_cierre_id_sku_id_almacen_id_key" ON "saldo_periodo"("cierre_id", "sku_id", "almacen_id");

-- AddForeignKey
ALTER TABLE "cierre_periodo" ADD CONSTRAINT "cierre_periodo_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cierre_periodo" ADD CONSTRAINT "cierre_periodo_cerrado_por_id_fkey" FOREIGN KEY ("cerrado_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saldo_periodo" ADD CONSTRAINT "saldo_periodo_cierre_id_fkey" FOREIGN KEY ("cierre_id") REFERENCES "cierre_periodo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saldo_periodo" ADD CONSTRAINT "saldo_periodo_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
