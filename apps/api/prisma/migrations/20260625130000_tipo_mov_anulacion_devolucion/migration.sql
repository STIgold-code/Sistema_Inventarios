-- Reverso de devolucion de venta anulada: nuevo tipo de movimiento del ledger.
ALTER TYPE "TipoMovimiento" ADD VALUE IF NOT EXISTS 'SALIDA_ANULACION_DEVOLUCION';
