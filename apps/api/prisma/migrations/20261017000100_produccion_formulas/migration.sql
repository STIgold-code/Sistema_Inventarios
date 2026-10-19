-- Produccion: formula (receta) y orden de produccion.
--   * La formula es una plantilla editable que indica que insumos y en que
--     cantidad producen una cantidad base de un SKU terminado.
--   * La orden de produccion congela su propia explosion de insumos al crearse,
--     consume por vales de salida vinculados y registra la entrada del
--     terminado al cerrarse.
-- Los registros existentes no cambian: la unica columna nueva en una tabla
-- existente (vale_salida.orden_produccion_id) es opcional.

-- 1. Estado de la orden de produccion.
DO $$
BEGIN
  CREATE TYPE "EstadoOrdenProduccion" AS ENUM ('PLANIFICADA', 'EN_PROCESO', 'CERRADA', 'ANULADA');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Formula (cabecera).
CREATE TABLE IF NOT EXISTS "formula" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "sku_terminado_id" BIGINT NOT NULL,
    "cantidad_base" DECIMAL(20,8) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "observaciones" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "formula_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "formula_empresa_id_codigo_key"
  ON "formula"("empresa_id", "codigo");
CREATE INDEX IF NOT EXISTS "formula_empresa_id_sku_terminado_id_idx"
  ON "formula"("empresa_id", "sku_terminado_id");

-- 3. Lineas de la formula (insumos por cantidad base).
CREATE TABLE IF NOT EXISTS "formula_linea" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "formula_id" BIGINT NOT NULL,
    "sku_insumo_id" BIGINT NOT NULL,
    "cantidad" DECIMAL(20,8) NOT NULL,

    CONSTRAINT "formula_linea_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "formula_linea_formula_id_sku_insumo_id_key"
  ON "formula_linea"("formula_id", "sku_insumo_id");

-- 4. Orden de produccion (cabecera).
CREATE TABLE IF NOT EXISTS "orden_produccion" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "numero" TEXT NOT NULL,
    "formula_id" BIGINT NOT NULL,
    "sku_terminado_id" BIGINT NOT NULL,
    "cantidad_planificada" DECIMAL(20,8) NOT NULL,
    "cantidad_producida" DECIMAL(20,8),
    "almacen_insumos_id" BIGINT NOT NULL,
    "almacen_destino_id" BIGINT NOT NULL,
    "centro_costo_id" BIGINT NOT NULL,
    "orden_trabajo_id" BIGINT,
    "estado" "EstadoOrdenProduccion" NOT NULL DEFAULT 'PLANIFICADA',
    "costo_total_insumos" DECIMAL(20,2),
    "costo_unitario_terminado" DECIMAL(20,8),
    "movimiento_entrada_id" BIGINT,
    "fecha_emision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_cierre" TIMESTAMP(3),
    "observaciones" TEXT,
    "usuario_id" BIGINT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orden_produccion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "orden_produccion_empresa_id_numero_key"
  ON "orden_produccion"("empresa_id", "numero");
CREATE INDEX IF NOT EXISTS "orden_produccion_empresa_id_estado_idx"
  ON "orden_produccion"("empresa_id", "estado");
CREATE INDEX IF NOT EXISTS "orden_produccion_empresa_id_sku_terminado_id_idx"
  ON "orden_produccion"("empresa_id", "sku_terminado_id");

-- 5. Lineas de la orden (explosion de insumos congelada al crear).
CREATE TABLE IF NOT EXISTS "orden_produccion_linea" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "orden_produccion_id" BIGINT NOT NULL,
    "sku_insumo_id" BIGINT NOT NULL,
    "cantidad_planificada" DECIMAL(20,8) NOT NULL,

    CONSTRAINT "orden_produccion_linea_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "orden_produccion_linea_orden_produccion_id_sku_insumo_id_key"
  ON "orden_produccion_linea"("orden_produccion_id", "sku_insumo_id");

-- 6. Vale de salida -> orden de produccion (opcional).
ALTER TABLE "vale_salida" ADD COLUMN IF NOT EXISTS "orden_produccion_id" BIGINT;
CREATE INDEX IF NOT EXISTS "vale_salida_empresa_id_orden_produccion_id_idx"
  ON "vale_salida"("empresa_id", "orden_produccion_id");

-- 7. Llaves foraneas. PostgreSQL no admite IF NOT EXISTS en ADD CONSTRAINT,
-- por eso cada una se agrega solo si aun no existe.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'formula_empresa_id_fkey') THEN
    ALTER TABLE "formula"
      ADD CONSTRAINT "formula_empresa_id_fkey"
      FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'formula_linea_formula_id_fkey') THEN
    ALTER TABLE "formula_linea"
      ADD CONSTRAINT "formula_linea_formula_id_fkey"
      FOREIGN KEY ("formula_id") REFERENCES "formula"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orden_produccion_empresa_id_fkey') THEN
    ALTER TABLE "orden_produccion"
      ADD CONSTRAINT "orden_produccion_empresa_id_fkey"
      FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orden_produccion_formula_id_fkey') THEN
    ALTER TABLE "orden_produccion"
      ADD CONSTRAINT "orden_produccion_formula_id_fkey"
      FOREIGN KEY ("formula_id") REFERENCES "formula"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orden_produccion_almacen_insumos_id_fkey') THEN
    ALTER TABLE "orden_produccion"
      ADD CONSTRAINT "orden_produccion_almacen_insumos_id_fkey"
      FOREIGN KEY ("almacen_insumos_id") REFERENCES "almacen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orden_produccion_almacen_destino_id_fkey') THEN
    ALTER TABLE "orden_produccion"
      ADD CONSTRAINT "orden_produccion_almacen_destino_id_fkey"
      FOREIGN KEY ("almacen_destino_id") REFERENCES "almacen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orden_produccion_centro_costo_id_fkey') THEN
    ALTER TABLE "orden_produccion"
      ADD CONSTRAINT "orden_produccion_centro_costo_id_fkey"
      FOREIGN KEY ("centro_costo_id") REFERENCES "centro_costo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orden_produccion_orden_trabajo_id_fkey') THEN
    ALTER TABLE "orden_produccion"
      ADD CONSTRAINT "orden_produccion_orden_trabajo_id_fkey"
      FOREIGN KEY ("orden_trabajo_id") REFERENCES "orden_trabajo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orden_produccion_usuario_id_fkey') THEN
    ALTER TABLE "orden_produccion"
      ADD CONSTRAINT "orden_produccion_usuario_id_fkey"
      FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orden_produccion_linea_orden_produccion_id_fkey') THEN
    ALTER TABLE "orden_produccion_linea"
      ADD CONSTRAINT "orden_produccion_linea_orden_produccion_id_fkey"
      FOREIGN KEY ("orden_produccion_id") REFERENCES "orden_produccion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vale_salida_orden_produccion_id_fkey') THEN
    ALTER TABLE "vale_salida"
      ADD CONSTRAINT "vale_salida_orden_produccion_id_fkey"
      FOREIGN KEY ("orden_produccion_id") REFERENCES "orden_produccion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
