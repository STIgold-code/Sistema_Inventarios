-- Referencia de Nota de Credito que sustenta la devolucion de venta. Se propaga
-- al ledger (serie/numero/fecha reales). Nullable por compatibilidad historica.
ALTER TABLE "devolucion_venta" ADD COLUMN "tipo_comprobante" TEXT;
ALTER TABLE "devolucion_venta" ADD COLUMN "serie_comprobante" TEXT;
ALTER TABLE "devolucion_venta" ADD COLUMN "numero_comprobante" TEXT;
ALTER TABLE "devolucion_venta" ADD COLUMN "fecha_comprobante" TIMESTAMP(3);
