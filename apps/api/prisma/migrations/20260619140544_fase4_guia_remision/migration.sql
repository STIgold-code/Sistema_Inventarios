-- CreateTable
CREATE TABLE "guia_remision" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "serie" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "fecha_traslado" TIMESTAMP(3) NOT NULL,
    "motivo_traslado" VARCHAR(2) NOT NULL,
    "transportista_doc" TEXT,
    "transportista_nombre" TEXT,
    "punto_partida" TEXT NOT NULL,
    "punto_llegada" TEXT NOT NULL,
    "peso_bruto" DECIMAL(20,3),
    "observaciones" TEXT,
    "traslado_id" BIGINT,
    "orden_venta_id" BIGINT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guia_remision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "guia_remision_empresa_id_traslado_id_idx" ON "guia_remision"("empresa_id", "traslado_id");

-- CreateIndex
CREATE INDEX "guia_remision_empresa_id_orden_venta_id_idx" ON "guia_remision"("empresa_id", "orden_venta_id");

-- CreateIndex
CREATE UNIQUE INDEX "guia_remision_empresa_id_serie_numero_key" ON "guia_remision"("empresa_id", "serie", "numero");

-- AddForeignKey
ALTER TABLE "guia_remision" ADD CONSTRAINT "guia_remision_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guia_remision" ADD CONSTRAINT "guia_remision_traslado_id_fkey" FOREIGN KEY ("traslado_id") REFERENCES "traslado"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guia_remision" ADD CONSTRAINT "guia_remision_orden_venta_id_fkey" FOREIGN KEY ("orden_venta_id") REFERENCES "orden_venta"("id") ON DELETE SET NULL ON UPDATE CASCADE;
