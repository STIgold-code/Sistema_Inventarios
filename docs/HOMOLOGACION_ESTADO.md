# Homologación con SISALM — Estado del programa

> **Propósito:** cerrar las 12 brechas de paridad detectadas entre el sistema
> nuevo y SISALM (Sistema Almacén v6.72 de Real Systems, el legacy que usa BM).
> Brechas completas en `docs/Comparativo_SISALM_vs_Sistema_Inventarios.txt`.
>
> **Este archivo es el punto de retome.** Si la conversación se compacta, leer
> esto primero para continuar sin re-diseñar.

Última actualización: 2026-06-26

---

## Cómo retomar (método por feature)

Cada feature pendiente tiene un spec de diseño detallado (schema exacto,
migración, archivos, lógica). Pasos:

1. Leer el spec de la feature (ver "Specs de diseño" abajo).
2. Schema: editar `apps/api/prisma/schema.prisma` (+ enums) y crear la migración
   a mano en `apps/api/prisma/migrations/AAAAMMDDHHMMSS_nombre/migration.sql`.
   - Tipo de movimiento nuevo ⇒ `ALTER TYPE "TipoMovimiento" ADD VALUE IF NOT EXISTS '...'`
     + editar `packages/tipos-dominio/src/dominio.ts` (`TIPO_MOVIMIENTO` + `SIGNO_POR_TIPO`).
3. Módulo backend (service/controller/dto/module) y registrarlo en
   `apps/api/src/app.module.ts`. Plantilla simple: `modulos/vendedores/`.
4. Frontend: `apps/web/src/lib/api.ts` (tipos+funciones), página en
   `apps/web/src/app/panel/<x>/page.tsx`, nav en `apps/web/src/lib/modulos.ts`.
5. Verificar: `pnpm --filter @bm/tipos build` (si tocaste tipos),
   `cd apps/api && pnpm exec prisma generate`,
   `pnpm --filter @bm/api exec tsc --noEmit`, `pnpm --filter @bm/web exec tsc --noEmit`,
   `cd apps/api && pnpm run db:deploy` (migra DB local),
   `pnpm exec dotenv -e ../../.env -- pnpm exec jest` (suite completa).
6. Commit (conventional, español, sin Co-Authored-By) + `git push origin master`.
   El deploy a Railway es automático.

### Reglas críticas (NO romper)
- **Permisos:** NO inventar permisos nuevos. El seed da todos los permisos al
  admin, pero **prod NO re-corre el seed**, así que un permiso nuevo bloquearía
  al admin. Reusar uno existente que el admin ya tiene (`inventario.ver`,
  `inventario.movimiento.crear`, `venta.gestionar`, `compra.gestionar`,
  `guia.gestionar`, `reporte.ver`, `ot.gestionar`, etc.).
- **Multi-tenant:** `empresaId` SIEMPRE del JWT (`@UsuarioActual`), nunca del
  request. Validar pertenencia con `findFirst({ id, empresaId })` antes de mutar.
- **Ledger inmutable:** todo reverso es un movimiento NUEVO. Usar el patrón
  `*EnTx` y el motor `apps/api/src/modulos/inventario/movimientos/movimiento.service.ts`.
  Transiciones de estado con CAS (`updateMany` con estado en WHERE + count).
- **Auditoría:** `this.auditoria.registrar(datos, tx)` DENTRO de la transacción.
- **UI:** español neutro (Perú, tuteo), sin modismos. `ParseBigIntPipe` para `:id`.

### Specs de diseño (origen)
Workflow de diseño paralelo (9 agentes Opus, read-only) que produjo specs
completos. JSON en (puede borrarse, es temp):
`…/tasks/w9e1cjx92.output` → parsear con node: `JSON.parse(...).result.features[]`.
Script para re-generar si se perdió:
`…/workflows/scripts/homologacion-sisalm-diseno-wf_ba5e2790-76b.js`.
El resumen de cada feature está abajo (suficiente para continuar sin el temp).

---

## Hechas (commiteadas, pusheadas, suite 39/39 verde)

| # | Feature | Commit | Qué quedó |
|---|---------|--------|-----------|
| 26 | **Vendedor** | `31ce3dc` | Maestro `Vendedor` + FK opcional en `Cliente` (vendedor por defecto) y `OrdenVenta` (hereda del cliente). Permiso `venta.gestionar`. Pantalla `/panel/vendedores` + selector en form de cliente. |
| 27 | **Transportistas** | `2abac4d` | Maestro `Transportista` (codigo, RUC, nombre) + FK opcional `transportistaId` en `GuiaRemision` con snapshot denormalizado. Permiso `guia.gestionar`. Pantalla `/panel/transportistas`. |
| 31 | **Entrada por producción** | `f90b0ec` | `TipoMovimiento.ENTRADA_PRODUCCION` (op SUNAT 10), `entradaPorProduccion()` en movimiento.service (reusa `aplicarEntrada`), endpoint `POST /inventario/produccion` (permiso `inventario.movimiento.crear`), opción "Producción" en pantalla de movimientos. |

---

## Pendientes (specs listos, en orden recomendado)

### 1. reportes-faltantes [L] — independiente, alto valor
Solo `apps/api/src/modulos/reportes/reportes.service.ts` + controller + frontend.
Cuatro reportes nuevos (cálculo puro, sin ledger): (a) **antigüedad/composición
de stock** por rangos; (b) **proyección de compra por días de stock** (consumo
promedio → días de cobertura → sugerido); (c) **rentabilidad por vendedor y por
línea** (la `OrdenVenta` ya tiene `vendedorId`; la línea sale de familia/producto);
(d) **kardex anual** (resumen 12 meses). Permiso `reporte.ver`.

### 2. devolucion-proveedor [L]
Nuevo `TipoMovimiento.SALIDA_DEVOLUCION_PROVEEDOR` (signo SALIDA). Salida
valorizada de mercadería recibida de un proveedor (reverso de recepción de
compra). Consume FIFO. Migración `ALTER TYPE ADD VALUE`. Permiso `compra.gestionar`.

### 3. transferencia-codigo [M]
DOS `TipoMovimiento` nuevos (SALIDA_TRANSFORMACION + ENTRADA_TRANSFORMACION).
Transformar un SKU en otro con factor (kits/re-empaque): salida del SKU origen +
entrada del SKU destino, mismo almacén, conservando valor. En una transacción.

### 4. pedido [L]
Documento previo a la guía/venta con control atendido/por atender por línea.
SIN impacto en ledger (es un documento). Estados BORRADOR/APROBADO/ATENDIDO_
PARCIAL/ATENDIDO/ANULADO. La orden de venta puede originarse de un pedido.

### 5. parametrizacion-utilitarios [M]
Tabla `ParametrosEmpresa` (costeo promedio activo, precios incluyen IGV, permite
serie única, unidad referencial visible) + **tasa de IGV editable por empresa**
(hoy `IGV_TASA` es constante en código — inyectarla desde la config) + gestor de
series de comprobante por tipo (BV/FT/NC/ND). Pantalla en Utilitarios.

### 6. consignacion [XL]  →  luego  7. formato-9-1 [S]
**consignacion**: la más compleja. 3 `TipoMovimiento` nuevos (op SUNAT
CONSIGNACION_ENTREGADA "04" / RECIBIDA "03"). Mercadería entregada a cliente/obra
en consignación (sigue siendo de la empresa). Definir si es almacén tipo
consignación o estado de stock — diseñar el modelo con cuidado (ver spec).
**formato-9-1** (hacer DESPUÉS): reporte PLE Registro de Consignaciones, análogo
a 12.1/13.1 en reportes.service. **Depende de consignación** (filtra movimientos
con op SUNAT 03/04); sin consignación devuelve cadena vacía. Permiso `reporte.ver`.

---

## Tareas (TaskList)
- #26 Vendedor ✅ · #27 Transportistas ✅ · #31 Producción ✅
- #28 devolucion-proveedor · #29 transferencia-codigo · #30 pedido
- #32 consignacion · #33 reportes-faltantes (+ formato 9.1) · #34 parametrizacion
