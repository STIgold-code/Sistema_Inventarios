-- Formatos en papel que el sistema absorbe:
--   * "Pedido de Materiales": el requerimiento de compra se vincula a una orden
--     de trabajo y cada linea admite marca/referencia y un proveedor sugerido.
--   * "Comprobante de Almacen - Salida": el vale de salida guarda el numero del
--     comprobante en papel y la persona que recibe el material.
-- Todas las columnas son opcionales: los registros existentes no cambian.

-- 1. Requerimiento de compra -> orden de trabajo.
ALTER TABLE "requerimiento_compra" ADD COLUMN IF NOT EXISTS "orden_trabajo_id" BIGINT;
CREATE INDEX IF NOT EXISTS "requerimiento_compra_empresa_id_orden_trabajo_id_idx"
  ON "requerimiento_compra"("empresa_id", "orden_trabajo_id");
ALTER TABLE "requerimiento_compra"
  ADD CONSTRAINT "requerimiento_compra_orden_trabajo_id_fkey"
  FOREIGN KEY ("orden_trabajo_id") REFERENCES "orden_trabajo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. Linea del requerimiento: referencia y proveedor sugerido.
ALTER TABLE "requerimiento_compra_linea" ADD COLUMN IF NOT EXISTS "referencia" TEXT;
ALTER TABLE "requerimiento_compra_linea" ADD COLUMN IF NOT EXISTS "proveedor_sugerido_id" BIGINT;
CREATE INDEX IF NOT EXISTS "requerimiento_compra_linea_empresa_id_proveedor_sugerido_id_idx"
  ON "requerimiento_compra_linea"("empresa_id", "proveedor_sugerido_id");
ALTER TABLE "requerimiento_compra_linea"
  ADD CONSTRAINT "requerimiento_compra_linea_proveedor_sugerido_id_fkey"
  FOREIGN KEY ("proveedor_sugerido_id") REFERENCES "proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Vale de salida: comprobante fisico y receptor del material.
ALTER TABLE "vale_salida" ADD COLUMN IF NOT EXISTS "comprobante_fisico" TEXT;
ALTER TABLE "vale_salida" ADD COLUMN IF NOT EXISTS "entregado_a" TEXT;
