-- CreateTable
CREATE TABLE "centro_costo" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "centro_costo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documento_correlativo" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "tipo_documento" TEXT NOT NULL,
    "serie" TEXT NOT NULL DEFAULT '',
    "ultimo_numero" INTEGER NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documento_correlativo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "centro_costo_empresa_id_idx" ON "centro_costo"("empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "centro_costo_empresa_id_codigo_key" ON "centro_costo"("empresa_id", "codigo");

-- CreateIndex
CREATE INDEX "documento_correlativo_empresa_id_idx" ON "documento_correlativo"("empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "documento_correlativo_empresa_id_tipo_documento_serie_key" ON "documento_correlativo"("empresa_id", "tipo_documento", "serie");

-- AddForeignKey
ALTER TABLE "centro_costo" ADD CONSTRAINT "centro_costo_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documento_correlativo" ADD CONSTRAINT "documento_correlativo_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
