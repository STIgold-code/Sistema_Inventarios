# ESTADO — Sistema de Inventarios BM Ingenieros

> Última actualización: 2026-06-16

## Qué es

Sistema de inventarios completo y SUNAT-compliant para **BENITES MALPICA INGENIEROS** ("BM ingenieros"),
empresa industrial/ferretera en Perú (sucursal Soledad). ~10,000 SKUs de materiales industriales.
Hoy lo manejan en Excel. Objetivo: sistema reciclable a cualquier negocio.

## Arquitectura central

- **Kardex = ledger inmutable** (append-only). Stock actual = proyección cacheada (`item_stock`).
- **Valuación por capas de costo** (FIFO disponible; default PROMEDIO ponderado, SUNAT Tabla 14 cód. 2).
- **Movimiento atómico**: ledger + capa + proyección en una `$transaction` con advisory lock por (empresa, sku, almacén). Stock nunca negativo.
- **Cumple SUNAT**: el ledger tiene los campos de los Formatos 12.1 (unidades físicas) y 13.1 (valorizado).

## Stack

NestJS 11 + Prisma 6 + PostgreSQL 17 (backend) · Next.js 15 + React 19 + Tailwind (frontend) · pnpm monorepo.

## Estado actual: SISTEMA COMPLETO — 8/8 FASES ✅ (16/16 tests)

### Funcionando y verificado
- Monorepo (`apps/api`, `apps/web`, `packages/tipos`, `packages/contratos`).
- Tablas migradas + secuencia + trigger de inmutabilidad del ledger.
- Seed con datos reales: empresa BM, sucursal Soledad, almacén 01, **53 familias reales**, 15 unidades SUNAT, rol ADMIN, usuario admin.
- **Fase 1**: Auth JWT + permisos. CRUD Producto/Sku. MovimientoService (entrada/salida, capas FIFO, promedio móvil). Kardex + stock. Concurrencia + inmutabilidad.
- **Fase 2 Compras**: proveedores, órdenes de compra, recepción parcial → ledger. Front incluido.
- **Fase 3 Ventas**: órdenes de venta con reserva (comprometido), despacho desde reserva, anulación. Saldo físico SUNAT correcto.
- **Fase 4 Trazabilidad**: ajuste de inventario + conteo físico / cuadre (diferencias generan ajustes en el ledger).
- **Fase 5 Reportes**: valorización, alertas de stock mínimo, **exportador PLE SUNAT 12.1 y 13.1** (verificado: cumple costo_total = cantidad × costo_unit).
- **Fase 6 Activos fijos**: categorías, activos, depreciación lineal mensual.
- **Fase 7 Importador**: carga masiva desde Excel. **10,220 SKUs reales de BM ya cargados** (2,171 con stock inicial, 0 errores).
- Puertos: API 4021, Web 3021.

### Credenciales / datos
- Postgres: `postgres:sql@localhost:5432/bm_inventarios`
- Usuario app: `admin@bmingenieros.pe` / `admin1234`

## Pendiente / mejoras futuras

- **Front** de activos e importador (en construcción, último).
- **TODO datos**: mapear códigos UNSPSC reales para PLE oficial; reemplazar RUC placeholder (`20100000001`) por el real; confirmar método de valuación con el contador.
- **Mejoras**: lotes/series/vencimientos en flujo de movimientos (modelos listos); POS; particionado del ledger si crece mucho.
- **Verificación visual** del front con la API levantada (Playwright).

## TODO importante
- [ ] Reemplazar RUC placeholder (`20100000001`) por el real de BM Ingenieros.
- [ ] Confirmar con el contador de BM el método de valuación y obligatoriedad SUNAT (umbral UIT).

## Cómo correr
```bash
pnpm install
pnpm --filter @bm/api db:migrate   # aplica migraciones
pnpm --filter @bm/api db:seed      # carga datos
pnpm dev                           # api (4021) + web (3021)
pnpm --filter @bm/api test         # tests de integración
```
