-- Parametrizacion general por empresa (IGV editable, flags de negocio).
CREATE TABLE "parametros_empresa" (
  "id" BIGSERIAL PRIMARY KEY,
  "empresa_id" BIGINT NOT NULL,
  "tasa_igv" DECIMAL(6,4) NOT NULL DEFAULT 0.18,
  "costeo_promedio_activo" BOOLEAN NOT NULL DEFAULT true,
  "precios_incluyen_igv" BOOLEAN NOT NULL DEFAULT false,
  "permite_serie_unica" BOOLEAN NOT NULL DEFAULT false,
  "unidad_referencial_visible" BOOLEAN NOT NULL DEFAULT true,
  "actualizado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "parametros_empresa_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id")
);
CREATE UNIQUE INDEX "parametros_empresa_empresa_id_key" ON "parametros_empresa"("empresa_id");
