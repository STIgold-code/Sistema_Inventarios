-- Maestro Vendedor + asignacion a cliente y a orden de venta.
CREATE TABLE "vendedor" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "documento" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vendedor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vendedor_empresa_id_codigo_key" ON "vendedor"("empresa_id", "codigo");

ALTER TABLE "vendedor" ADD CONSTRAINT "vendedor_empresa_id_fkey"
    FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cliente" ADD COLUMN "vendedor_id" BIGINT;
ALTER TABLE "cliente" ADD CONSTRAINT "cliente_vendedor_id_fkey"
    FOREIGN KEY ("vendedor_id") REFERENCES "vendedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "orden_venta" ADD COLUMN "vendedor_id" BIGINT;
ALTER TABLE "orden_venta" ADD CONSTRAINT "orden_venta_vendedor_id_fkey"
    FOREIGN KEY ("vendedor_id") REFERENCES "vendedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
