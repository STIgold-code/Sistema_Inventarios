-- Ingreso de producto terminado por produccion: nuevo tipo de movimiento y de documento.
ALTER TYPE "TipoMovimiento" ADD VALUE IF NOT EXISTS 'ENTRADA_PRODUCCION';
ALTER TYPE "TipoDocumentoOrigen" ADD VALUE IF NOT EXISTS 'PRODUCCION';
