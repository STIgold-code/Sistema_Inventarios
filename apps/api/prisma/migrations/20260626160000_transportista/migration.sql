-- Maestro Transportista + FK opcional en guia_remision (mantiene texto libre por compat).
CREATE TABLE "transportista" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "codigo" TEXT NOT NULL,
    "ruc" TEXT,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "transportista_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "transportista_empresa_id_codigo_key" ON "transportista"("empresa_id", "codigo");

ALTER TABLE "transportista" ADD CONSTRAINT "transportista_empresa_id_fkey"
    FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "guia_remision" ADD COLUMN "transportista_id" BIGINT;
ALTER TABLE "guia_remision" ADD CONSTRAINT "guia_remision_transportista_id_fkey"
    FOREIGN KEY ("transportista_id") REFERENCES "transportista"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "guia_remision_empresa_id_transportista_id_idx" ON "guia_remision"("empresa_id", "transportista_id");
