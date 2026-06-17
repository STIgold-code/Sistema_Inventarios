-- CreateEnum
CREATE TYPE "TipoMovimiento" AS ENUM ('ENTRADA_COMPRA', 'ENTRADA_AJUSTE', 'ENTRADA_TRANSFERENCIA', 'ENTRADA_DEVOLUCION', 'ENTRADA_INICIAL', 'SALIDA_VENTA', 'SALIDA_AJUSTE', 'SALIDA_TRANSFERENCIA', 'SALIDA_MERMA');

-- CreateEnum
CREATE TYPE "SignoMovimiento" AS ENUM ('ENTRADA', 'SALIDA');

-- CreateEnum
CREATE TYPE "TipoDocumentoOrigen" AS ENUM ('ORDEN_COMPRA', 'RECEPCION', 'VENTA', 'AJUSTE', 'TRANSFERENCIA', 'CONTEO_FISICO', 'INICIAL');

-- CreateEnum
CREATE TYPE "EstadoLote" AS ENUM ('ACTIVO', 'AGOTADO', 'BLOQUEADO', 'VENCIDO');

-- CreateEnum
CREATE TYPE "MetodoDepreciacion" AS ENUM ('LINEAL', 'ACELERADA');

-- CreateEnum
CREATE TYPE "EstadoActivo" AS ENUM ('OPERATIVO', 'EN_REPARACION', 'BAJA', 'EXTRAVIADO');

-- CreateTable
CREATE TABLE "empresa" (
    "id" BIGSERIAL NOT NULL,
    "ruc" VARCHAR(11) NOT NULL,
    "razon_social" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sucursal" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "sucursal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "almacen" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "sucursal_id" BIGINT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "almacen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ubicacion" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "almacen_id" BIGINT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descripcion" TEXT,

    CONSTRAINT "ubicacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "familia" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "familia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unidad" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "unidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producto" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "familia_id" BIGINT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sku" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "producto_id" BIGINT NOT NULL,
    "codigo_parlante" VARCHAR(14) NOT NULL,
    "codigo_unspsc" VARCHAR(16),
    "codigo_barras" TEXT,
    "unidad_id" BIGINT NOT NULL,
    "nombre" TEXT,
    "tipo_existencia" VARCHAR(2) NOT NULL DEFAULT '01',
    "metodo_valuacion" VARCHAR(2) NOT NULL DEFAULT '2',
    "stock_minimo" DECIMAL(20,8),
    "controla_lote" BOOLEAN NOT NULL DEFAULT false,
    "controla_serie" BOOLEAN NOT NULL DEFAULT false,
    "controla_vencimiento" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sku_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lote" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "sku_id" BIGINT NOT NULL,
    "codigo" TEXT NOT NULL,
    "fecha_vencimiento" TIMESTAMP(3),
    "estado" "EstadoLote" NOT NULL DEFAULT 'ACTIVO',

    CONSTRAINT "lote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_stock" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "sku_id" BIGINT NOT NULL,
    "almacen_id" BIGINT NOT NULL,
    "ubicacion_id" BIGINT,
    "lote_id" BIGINT,
    "serie" TEXT,
    "cantidad_disponible" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "cantidad_comprometida" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "costo_promedio" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimiento_stock" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "sku_id" BIGINT NOT NULL,
    "almacen_id" BIGINT NOT NULL,
    "item_stock_id" BIGINT NOT NULL,
    "lote_id" BIGINT,
    "tipo" "TipoMovimiento" NOT NULL,
    "signo" "SignoMovimiento" NOT NULL,
    "cantidad" DECIMAL(20,8) NOT NULL,
    "costo_unitario" DECIMAL(20,8) NOT NULL,
    "costo_total" DECIMAL(20,2) NOT NULL,
    "saldo_cantidad" DECIMAL(20,8) NOT NULL,
    "saldo_costo_unitario" DECIMAL(20,8) NOT NULL,
    "saldo_costo_total" DECIMAL(20,2) NOT NULL,
    "documento_tipo" "TipoDocumentoOrigen" NOT NULL,
    "documento_id" BIGINT,
    "periodo" VARCHAR(6) NOT NULL,
    "fecha_emision_documento" TIMESTAMP(3) NOT NULL,
    "cuo" VARCHAR(40) NOT NULL,
    "numero_correlativo" TEXT NOT NULL,
    "secuencia" BIGINT NOT NULL,
    "indicador_estado" VARCHAR(1) NOT NULL DEFAULT '1',
    "tipo_documento_sunat" VARCHAR(2) NOT NULL,
    "serie_comprobante" TEXT NOT NULL DEFAULT '0',
    "numero_comprobante" TEXT NOT NULL DEFAULT '0',
    "tipo_operacion_sunat" VARCHAR(2) NOT NULL,
    "usuario_id" BIGINT NOT NULL,
    "fecha_movimiento" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observaciones" TEXT,

    CONSTRAINT "movimiento_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capa_costo" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "sku_id" BIGINT NOT NULL,
    "almacen_id" BIGINT NOT NULL,
    "lote_id" BIGINT,
    "movimiento_entrada_id" BIGINT NOT NULL,
    "cantidad_inicial" DECIMAL(20,8) NOT NULL,
    "cantidad_restante" DECIMAL(20,8) NOT NULL,
    "costo_unitario" DECIMAL(20,8) NOT NULL,
    "fecha_ingreso" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agotada" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "capa_costo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumo_capa" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "movimiento_salida_id" BIGINT NOT NULL,
    "capa_costo_id" BIGINT NOT NULL,
    "cantidad" DECIMAL(20,8) NOT NULL,
    "costo_unitario" DECIMAL(20,8) NOT NULL,

    CONSTRAINT "consumo_capa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "email" TEXT NOT NULL,
    "hash_clave" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rol" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "rol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permiso" (
    "id" BIGSERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "permiso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rol_permiso" (
    "rol_id" BIGINT NOT NULL,
    "permiso_id" BIGINT NOT NULL,

    CONSTRAINT "rol_permiso_pkey" PRIMARY KEY ("rol_id","permiso_id")
);

-- CreateTable
CREATE TABLE "usuario_rol" (
    "usuario_id" BIGINT NOT NULL,
    "rol_id" BIGINT NOT NULL,

    CONSTRAINT "usuario_rol_pkey" PRIMARY KEY ("usuario_id","rol_id")
);

-- CreateTable
CREATE TABLE "categoria_activo" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "nombre" TEXT NOT NULL,
    "vida_util_meses" INTEGER NOT NULL,
    "tasa_anual" DECIMAL(7,4) NOT NULL,

    CONSTRAINT "categoria_activo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activo_fijo" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "sucursal_id" BIGINT NOT NULL,
    "categoria_id" BIGINT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "marca" TEXT,
    "modelo" TEXT,
    "numero_serie" TEXT,
    "departamento" TEXT,
    "responsable_id" BIGINT,
    "fecha_compra" TIMESTAMP(3) NOT NULL,
    "valor_adquisicion" DECIMAL(20,2) NOT NULL,
    "valor_residual" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "metodo_depreciacion" "MetodoDepreciacion" NOT NULL DEFAULT 'LINEAL',
    "vida_util_meses" INTEGER NOT NULL,
    "fecha_fin_garantia" TIMESTAMP(3),
    "estado" "EstadoActivo" NOT NULL DEFAULT 'OPERATIVO',
    "depreciacion_acumulada" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "valor_actual" DECIMAL(20,2) NOT NULL,

    CONSTRAINT "activo_fijo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "depreciacion_activo" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "activo_id" BIGINT NOT NULL,
    "periodo" VARCHAR(7) NOT NULL,
    "monto_periodo" DECIMAL(20,2) NOT NULL,
    "acumulado_hasta" DECIMAL(20,2) NOT NULL,
    "valor_en_libros" DECIMAL(20,2) NOT NULL,
    "generado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "depreciacion_activo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "empresa_ruc_key" ON "empresa"("ruc");

-- CreateIndex
CREATE INDEX "sucursal_empresa_id_idx" ON "sucursal"("empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "sucursal_empresa_id_codigo_key" ON "sucursal"("empresa_id", "codigo");

-- CreateIndex
CREATE INDEX "almacen_empresa_id_sucursal_id_idx" ON "almacen"("empresa_id", "sucursal_id");

-- CreateIndex
CREATE UNIQUE INDEX "almacen_empresa_id_codigo_key" ON "almacen"("empresa_id", "codigo");

-- CreateIndex
CREATE INDEX "ubicacion_empresa_id_almacen_id_idx" ON "ubicacion"("empresa_id", "almacen_id");

-- CreateIndex
CREATE UNIQUE INDEX "ubicacion_almacen_id_codigo_key" ON "ubicacion"("almacen_id", "codigo");

-- CreateIndex
CREATE INDEX "familia_empresa_id_idx" ON "familia"("empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "familia_empresa_id_codigo_key" ON "familia"("empresa_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "unidad_empresa_id_codigo_key" ON "unidad"("empresa_id", "codigo");

-- CreateIndex
CREATE INDEX "producto_empresa_id_familia_id_idx" ON "producto"("empresa_id", "familia_id");

-- CreateIndex
CREATE INDEX "sku_empresa_id_producto_id_idx" ON "sku"("empresa_id", "producto_id");

-- CreateIndex
CREATE UNIQUE INDEX "sku_empresa_id_codigo_parlante_key" ON "sku"("empresa_id", "codigo_parlante");

-- CreateIndex
CREATE INDEX "lote_empresa_id_sku_id_fecha_vencimiento_idx" ON "lote"("empresa_id", "sku_id", "fecha_vencimiento");

-- CreateIndex
CREATE UNIQUE INDEX "lote_empresa_id_sku_id_codigo_key" ON "lote"("empresa_id", "sku_id", "codigo");

-- CreateIndex
CREATE INDEX "item_stock_empresa_id_sku_id_almacen_id_idx" ON "item_stock"("empresa_id", "sku_id", "almacen_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_stock_empresa_id_sku_id_almacen_id_ubicacion_id_lote_i_key" ON "item_stock"("empresa_id", "sku_id", "almacen_id", "ubicacion_id", "lote_id", "serie");

-- CreateIndex
CREATE INDEX "movimiento_stock_empresa_id_sku_id_fecha_movimiento_secuenc_idx" ON "movimiento_stock"("empresa_id", "sku_id", "fecha_movimiento", "secuencia");

-- CreateIndex
CREATE INDEX "movimiento_stock_empresa_id_almacen_id_fecha_movimiento_idx" ON "movimiento_stock"("empresa_id", "almacen_id", "fecha_movimiento");

-- CreateIndex
CREATE INDEX "movimiento_stock_empresa_id_periodo_idx" ON "movimiento_stock"("empresa_id", "periodo");

-- CreateIndex
CREATE INDEX "movimiento_stock_documento_tipo_documento_id_idx" ON "movimiento_stock"("documento_tipo", "documento_id");

-- CreateIndex
CREATE UNIQUE INDEX "capa_costo_movimiento_entrada_id_key" ON "capa_costo"("movimiento_entrada_id");

-- CreateIndex
CREATE INDEX "capa_costo_empresa_id_sku_id_almacen_id_agotada_fecha_ingre_idx" ON "capa_costo"("empresa_id", "sku_id", "almacen_id", "agotada", "fecha_ingreso");

-- CreateIndex
CREATE INDEX "consumo_capa_movimiento_salida_id_idx" ON "consumo_capa"("movimiento_salida_id");

-- CreateIndex
CREATE INDEX "consumo_capa_capa_costo_id_idx" ON "consumo_capa"("capa_costo_id");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_empresa_id_email_key" ON "usuario"("empresa_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "rol_empresa_id_codigo_key" ON "rol"("empresa_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "permiso_codigo_key" ON "permiso"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "categoria_activo_empresa_id_nombre_key" ON "categoria_activo"("empresa_id", "nombre");

-- CreateIndex
CREATE INDEX "activo_fijo_empresa_id_sucursal_id_idx" ON "activo_fijo"("empresa_id", "sucursal_id");

-- CreateIndex
CREATE UNIQUE INDEX "activo_fijo_empresa_id_codigo_key" ON "activo_fijo"("empresa_id", "codigo");

-- CreateIndex
CREATE INDEX "depreciacion_activo_empresa_id_periodo_idx" ON "depreciacion_activo"("empresa_id", "periodo");

-- CreateIndex
CREATE UNIQUE INDEX "depreciacion_activo_empresa_id_activo_id_periodo_key" ON "depreciacion_activo"("empresa_id", "activo_id", "periodo");

-- AddForeignKey
ALTER TABLE "sucursal" ADD CONSTRAINT "sucursal_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "almacen" ADD CONSTRAINT "almacen_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ubicacion" ADD CONSTRAINT "ubicacion_almacen_id_fkey" FOREIGN KEY ("almacen_id") REFERENCES "almacen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "familia" ADD CONSTRAINT "familia_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unidad" ADD CONSTRAINT "unidad_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto" ADD CONSTRAINT "producto_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto" ADD CONSTRAINT "producto_familia_id_fkey" FOREIGN KEY ("familia_id") REFERENCES "familia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sku" ADD CONSTRAINT "sku_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sku" ADD CONSTRAINT "sku_unidad_id_fkey" FOREIGN KEY ("unidad_id") REFERENCES "unidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lote" ADD CONSTRAINT "lote_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_stock" ADD CONSTRAINT "item_stock_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_stock" ADD CONSTRAINT "movimiento_stock_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_stock" ADD CONSTRAINT "movimiento_stock_item_stock_id_fkey" FOREIGN KEY ("item_stock_id") REFERENCES "item_stock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_stock" ADD CONSTRAINT "movimiento_stock_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capa_costo" ADD CONSTRAINT "capa_costo_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capa_costo" ADD CONSTRAINT "capa_costo_movimiento_entrada_id_fkey" FOREIGN KEY ("movimiento_entrada_id") REFERENCES "movimiento_stock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumo_capa" ADD CONSTRAINT "consumo_capa_movimiento_salida_id_fkey" FOREIGN KEY ("movimiento_salida_id") REFERENCES "movimiento_stock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumo_capa" ADD CONSTRAINT "consumo_capa_capa_costo_id_fkey" FOREIGN KEY ("capa_costo_id") REFERENCES "capa_costo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rol" ADD CONSTRAINT "rol_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rol_permiso" ADD CONSTRAINT "rol_permiso_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "rol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rol_permiso" ADD CONSTRAINT "rol_permiso_permiso_id_fkey" FOREIGN KEY ("permiso_id") REFERENCES "permiso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_rol" ADD CONSTRAINT "usuario_rol_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_rol" ADD CONSTRAINT "usuario_rol_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "rol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activo_fijo" ADD CONSTRAINT "activo_fijo_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria_activo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activo_fijo" ADD CONSTRAINT "activo_fijo_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depreciacion_activo" ADD CONSTRAINT "depreciacion_activo_activo_id_fkey" FOREIGN KEY ("activo_id") REFERENCES "activo_fijo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
