-- Secuencia global monotonica para desempatar el orden del kardex.
CREATE SEQUENCE IF NOT EXISTS movimiento_secuencia AS BIGINT START 1;

-- Inmutabilidad del ledger: el registro de inventario permanente (SUNAT) NO
-- puede modificarse ni borrarse. Las correcciones se hacen con movimientos de
-- reverso (ajustes), nunca alterando el historico.
CREATE OR REPLACE FUNCTION bloquear_modificacion_ledger()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'El ledger de movimientos es inmutable: no se permite % sobre movimiento_stock', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_movimiento_inmutable ON movimiento_stock;
CREATE TRIGGER trg_movimiento_inmutable
  BEFORE UPDATE OR DELETE ON movimiento_stock
  FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_ledger();