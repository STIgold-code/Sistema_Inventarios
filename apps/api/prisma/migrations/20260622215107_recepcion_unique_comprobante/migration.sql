-- Unicidad del comprobante del proveedor en recepcion (empresa + tipoDoc + serie + numero),
-- alineada con comprobante_venta y guia_remision.
--
-- Decision de seguridad sobre datos existentes:
--   1) Backfill dummy: muchas recepciones viejas tienen serie/numero '0' (placeholder
--      de migracion). Esas chocarian entre si. Por eso la unicidad se aplica como
--      INDICE PARCIAL que EXCLUYE serie='0' o numero='0' (no representan un comprobante
--      real, no deben ser unicas).
--   2) Duplicados reales preexistentes (mismo tipoDoc/serie/numero repetido por corridas
--      de prueba): no se pueden borrar (tienen movimientos del ledger enlazados via
--      recepcion_linea). Se conservan TODAS las filas; a las copias sobrantes (todas menos
--      la de menor id por clave) se les sufija el numero con '-DUP{id}' para que dejen de
--      colisionar sin perder la referencia. La recepcion de menor id por clave conserva su
--      numero original.
--
-- El ledger (movimiento_stock) NO se toca: este saneamiento solo ajusta el header de
-- recepcion para poder imponer la unicidad hacia adelante.

-- 1) Sanea duplicados reales preexistentes (excluye los dummy '0').
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY empresa_id, tipo_documento_sunat, serie_comprobante, numero_comprobante
      ORDER BY id
    ) AS rn
  FROM recepcion
  WHERE serie_comprobante <> '0' AND numero_comprobante <> '0'
)
UPDATE recepcion r
SET numero_comprobante = r.numero_comprobante || '-DUP' || r.id
FROM ranked
WHERE r.id = ranked.id
  AND ranked.rn > 1;

-- 2) Indice unico parcial: ignora las recepciones con serie/numero dummy '0'.
CREATE UNIQUE INDEX "recepcion_empresa_tipo_serie_numero_key"
  ON "recepcion" ("empresa_id", "tipo_documento_sunat", "serie_comprobante", "numero_comprobante")
  WHERE "serie_comprobante" <> '0' AND "numero_comprobante" <> '0';
