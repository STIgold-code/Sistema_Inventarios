# ESTADO — Sistema de Inventarios BM Ingenieros

> Última actualización: 2026-10-19

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

## En curso (2026-10-19): rama `feat/produccion-formulas` — fórmulas y órdenes de producción

Rescatado del análisis competitivo de Gecope (`reports/Análisis del sistema Gecope.md`): BM fabrica y el ingreso de producción tenía costo manual.
Diseño en `docs/superpowers/specs/2026-10-16-formula-produccion-design.md`; plan en `docs/superpowers/plans/2026-10-16-formula-produccion.md`; ledger de ejecución y revisiones en `.superpowers/sdd/2026-10-16-formula-produccion/` (ignorado por git).

- **Modelo**: `Formula`/`FormulaLinea` (receta por SKU terminado, cantidad base) y `OrdenProduccion`/`OrdenProduccionLinea` (explosión congelada al crear la orden). Estados `PLANIFICADA → EN_PROCESO → CERRADA`, `ANULADA` solo desde planificada. `ValeSalida.ordenProduccionId` vincula el consumo. Migraciones `20261017000000` (enum) y `20261017000100` (tablas).
- **Flujo**: crear fórmula → crear orden → "Generar vale" (vale BORRADOR con el pendiente) → flujo normal de vales (autorizar/despachar; despachar pasa la orden a EN_PROCESO) → "Cerrar orden" (ingreso del terminado con costo = Σ `costoTotal` de las salidas del ledger, promedio móvil, no FIFO).
- **Consumo** no se persiste: se lee del ledger (`MovimientoStock` de los vales DESPACHADO). SKUs fuera de fórmula también suman al costo.
- **Permisos**: `formula.gestionar`, `produccion.gestionar`, `produccion.cerrar` (ADMIN los tiene tras `db:seed`). Catálogo de fórmulas activas para quien gestiona producción: `GET /ordenes-produccion/formulas-disponibles`.
- **Web**: grupo "Producción" en el panel (`/panel/formulas`, `/panel/ordenes-produccion`). `SelectorSku`/`SelectorBusqueda`/`PanelLateral`/`ModalConfirmacion` ahora aíslan Escape (cerrar la lista no cierra el panel) y aceptan `id`/aria.
- **Verificación**: 21 commits, cada tarea con revisor independiente y revisión final de rama. Suite completa de la API 220/220. Sin push ni PR todavía.
- **Deudas explícitas**: selector de orden de producción en el alta manual de vales (el API ya lo soporta); `produccion.cerrar` requiere además `produccion.gestionar` para llegar al detalle; validar con contabilidad si el ingreso del terminado va con Tabla 12 código 10 (como el ingreso manual actual) o 99.
- **Entorno (preexistente, fuera de la rama)**: `pnpm --filter @bm/api lint` no corre (falta `eslint.config.*` en `apps/api`); el script `test` de la API no carga `.env` (usar `pnpm --filter @bm/api exec dotenv -e ../../.env -- jest`); `tsc` del web muestra 16 errores por `packages/contratos/dist` desactualizado (regenerar el dist local); `series.spec.ts` y `atomicidad.spec.ts` pueden chocar por códigos de SKU `9`+timestamp; hay drift menor entre la BD dev y el schema (ON DELETE en 6 FKs, índice `token_refresh_token_hash_idx`, default en `parametros_empresa.actualizado_en`), no aceptar un `migrate dev` que lo "arregle" sin revisarlo.

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
