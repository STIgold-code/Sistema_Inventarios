-- Nuevo documento de origen para el movimiento de entrada del cierre de una
-- orden de produccion. Va en su propia migracion porque un valor nuevo de enum
-- no puede usarse en la misma transaccion que lo crea.
ALTER TYPE "TipoDocumentoOrigen" ADD VALUE IF NOT EXISTS 'ORDEN_PRODUCCION';
