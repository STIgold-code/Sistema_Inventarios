# Fórmulas y órdenes de producción: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir definir fórmulas (BOM) por SKU terminado, crear órdenes de producción que consumen insumos por vales de salida y cerrarlas ingresando el producto terminado con el costo real que el ledger descontó.

**Architecture:** Nuevo módulo NestJS `produccion` (fórmulas y órdenes) que reutiliza `ValesService` para el consumo y `MovimientoService` para la entrada valorizada. La orden congela la explosión de insumos; el consumo real se lee del ledger (`MovimientoStock` con `documentoTipo = VALE_SALIDA`) y el cierre crea una `ENTRADA_PRODUCCION` con `documentoTipo = ORDEN_PRODUCCION`. Dos páginas Next.js nuevas.

**Tech Stack:** NestJS 10, Prisma (PostgreSQL), class-validator, Jest de integración contra base real, Next.js App Router, Tailwind, componentes propios (`PanelLateral`, `ficha-detalle`, `ModalConfirmacion`, `SelectorBusqueda`).

**Spec:** `docs/superpowers/specs/2026-10-16-formula-produccion-design.md`

## Global Constraints

- Identificadores, comentarios, textos de UI, mensajes de error y commits en **español neutro** (tuteo, sin regionalismos). Prefijos conventional commits en inglés.
- TypeScript estricto; sin `any`. PKs `BigInt` en servicio, `string` en respuestas (`id.toString()`).
- Multi-tenant: toda lectura y escritura filtra por `empresaId`; propiedad cruzada responde 404 (`NotFoundException`).
- Cantidades y costos como `Prisma.Decimal` (`const D = Prisma.Decimal`); en DTOs las cantidades viajan como texto validado con `REGEX_DECIMAL = /^(?!0+(\.0+)?$)\d+(\.\d+)?$/` (positivo, definido localmente en el archivo DTO, como en `vales.dto.ts`).
- Transiciones de estado con CAS (`updateMany` condicionado y `count === 0` lanza `ConflictException`) y auditoría (`AuditoriaService.registrar(..., tx)`) dentro de la misma `$transaction`.
- Imports con sufijo `.js` (ESM). Módulos en `apps/api/src/modulos/<kebab>/`.
- pnpm siempre. Antes de cada commit: `pnpm --filter @bm/api lint` y los tests de la tarea. Nunca `build`. Nunca `push`.
- El ledger es inmutable: los tests no borran filas que llegaron al ledger (patrón `RUN` de `test/vale.spec.ts`).

## Review Focus

1. Insumo con dos compras a costos distintos (50 a 4 y 50 a 6): el cierre debe costear con el promedio que el ledger descontó (salida de 20 vale 100), no con FIFO (80). Test en Tarea 6.
2. Vale manual contra la orden con un SKU que no está en la fórmula: el detalle lo muestra como consumo fuera de fórmula y el cierre lo incluye en el costo. Test en Tarea 6.
3. Vale autorizado pero no despachado al momento del cierre: el cierre debe rechazar con 400 y no ingresar nada. Test en Tarea 6.
4. Fórmula editada después de crear la orden: las líneas de la orden no cambian. Test en Tarea 5.
5. Explosión con decimal periódico (base 3, insumo 1, planificada 1): la línea queda en `0.33333333` (8 decimales), sin error. Test en Tarea 5.

---

### Task 1: Modelos Prisma, migraciones y tipos de dominio

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (enum `TipoDocumentoOrigen` ~L45, `Empresa` ~L120, `OrdenTrabajo` ~L824, `ValeSalida` ~L769, nuevos modelos al final de la sección de OT)
- Create: `apps/api/prisma/migrations/20261017000000_tipo_documento_orden_produccion/migration.sql`
- Create: `apps/api/prisma/migrations/20261017000100_produccion_formulas/migration.sql`
- Modify: `packages/tipos-dominio/src/dominio.ts:48-61`

**Interfaces:**
- Produces: enum `EstadoOrdenProduccion { PLANIFICADA, EN_PROCESO, CERRADA, ANULADA }`; valor `ORDEN_PRODUCCION` en `TipoDocumentoOrigen`; modelos `Formula`, `FormulaLinea`, `OrdenProduccion`, `OrdenProduccionLinea` con los campos de la sección "Modelo de datos" del spec; `ValeSalida.ordenProduccionId BigInt?` con relación `ordenProduccion` e índice `(empresaId, ordenProduccionId)`; `OrdenProduccion.valesSalida ValeSalida[]`, `OrdenProduccion.lineas`, `Formula.lineas`, `OrdenTrabajo.ordenesProduccion`.
- Tablas: `formula`, `formula_linea`, `orden_produccion`, `orden_produccion_linea`; columnas en snake_case con `@map`, como el resto del schema.

- [ ] **Paso 1: Agregar enum, valor de `TipoDocumentoOrigen` y modelos al schema**

Relaciones declaradas: `empresa`, `almacenInsumos`, `almacenDestino`, `centroCosto`, `ordenTrabajo`, `formula`, `usuario` (quien crea) y `valesSalida`. Los campos `skuTerminadoId` y `skuInsumoId` siguen el patrón de `ValeSalidaLinea.skuId` (mismo tratamiento de relación y FK que ese campo tiene hoy). `FormulaLinea` y `OrdenProduccionLinea` borran en cascada con su cabecera.

- [ ] **Paso 2: Escribir la migración del enum, sola**

```sql
ALTER TYPE "TipoDocumentoOrigen" ADD VALUE IF NOT EXISTS 'ORDEN_PRODUCCION';
```

- [ ] **Paso 3: Escribir la migración de tablas (SQL idempotente, comentarios en español)**

Incluye `CREATE TYPE "EstadoOrdenProduccion"`, las cuatro tablas con sus FK, índices y únicos del spec, y `ALTER TABLE "vale_salida" ADD COLUMN IF NOT EXISTS "orden_produccion_id" BIGINT` con FK e índice. Tomar como referencia `20261016000000_formatos_papel/migration.sql`.

- [ ] **Paso 4: Reflejar en tipos de dominio**

Agregar `ORDEN_PRODUCCION: "ORDEN_PRODUCCION"` a `TIPO_DOCUMENTO_ORIGEN`. Si `dominio.ts` ya refleja `EstadoValeSalida`, reflejar también `ESTADO_ORDEN_PRODUCCION` con el mismo patrón; si no, no agregarlo.

- [ ] **Paso 5: Aplicar y generar**

Run: `pnpm --filter @bm/api db:migrate` y luego `pnpm --filter @bm/api db:generate`
Expected: las dos migraciones se aplican sin drift y el cliente se regenera.

- [ ] **Paso 6: Verificar que nada existente se rompió**

Run: `pnpm --filter @bm/api lint && pnpm --filter @bm/api test -- test/vale.spec.ts`
Expected: lint limpio, suite de vales en verde.

- [ ] **Paso 7: Commit**

```bash
git add apps/api/prisma packages/tipos-dominio/src/dominio.ts
git commit -m "feat(produccion): modelos de fórmula y orden de producción con migraciones"
```

---

### Task 2: Entrada de producción en transacción con costo total

**Files:**
- Modify: `apps/api/src/modulos/inventario/movimientos/movimiento.service.ts` (junto a `entradaPorTransformacionEnTx`, ~L1028)
- Test: `apps/api/test/produccion-entrada.spec.ts`

**Interfaces:**
- Consumes: `aplicarEntrada`, `bloquear`, `obtenerOcrearItem` (privados del mismo servicio), `TIPO_MOVIMIENTO.ENTRADA_PRODUCCION`, `TIPO_OPERACION.SALIDA_PRODUCCION`.
- Produces:

```ts
async entradaPorProduccionEnTx(
  usuario: UsuarioRequest,
  tx: Tx,
  dto: { skuId: bigint; almacenId: bigint; cantidad: string; costoTotal: string; documentoId: bigint; observaciones?: string },
): Promise<{ movimientoId: bigint; costoUnitario: Prisma.Decimal }>
```

Reglas: `cantidad` cero o negativa lanza `BadRequestException("La cantidad producida debe ser mayor que cero")`; `costoUnitario = costoTotal ÷ cantidad`; `tipo = ENTRADA_PRODUCCION`, `documentoTipo = "ORDEN_PRODUCCION"`, `tipoOperacionSunat = SALIDA_PRODUCCION`, observación por defecto `"Ingreso de producción por orden"`. No se toca `entradaPorProduccion` existente.

- [ ] **Paso 1: Escribir el test que falla**

Setup como `test/homologacion.spec.ts:79` (empresa, usuario, almacén, SKU nuevo con sufijo `RUN`). Casos:

```ts
it("crea la entrada con costo unitario = costoTotal / cantidad y su capa", async () => {
  // dentro de prisma.$transaction: cantidad "40", costoTotal "150", documentoId 999999n
  // movimiento.tipo === "ENTRADA_PRODUCCION"; documentoTipo === "ORDEN_PRODUCCION"; documentoId === 999999n
  // costoUnitario.toNumber() === 3.75; capaCosto.cantidadRestante == 40 y costoUnitario == 3.75
  // itemStock.cantidadDisponible sube en 40
});
it("rechaza cantidad cero", async () => { /* BadRequestException */ });
```

- [ ] **Paso 2: Verificar que falla**

Run: `pnpm --filter @bm/api test -- test/produccion-entrada.spec.ts`
Expected: FAIL, `entradaPorProduccionEnTx is not a function`.

- [ ] **Paso 3: Implementar el método espejando `entradaPorTransformacionEnTx`**

- [ ] **Paso 4: Verificar que pasa**

Run: `pnpm --filter @bm/api test -- test/produccion-entrada.spec.ts`
Expected: PASS.

- [ ] **Paso 5: Commit**

```bash
git add apps/api/src/modulos/inventario/movimientos/movimiento.service.ts apps/api/test/produccion-entrada.spec.ts
git commit -m "feat(inventario): entrada de producción en transacción con costo total"
```

---

### Task 3: API de fórmulas

**Files:**
- Create: `apps/api/src/modulos/produccion/produccion.module.ts`
- Create: `apps/api/src/modulos/produccion/formulas.controller.ts`
- Create: `apps/api/src/modulos/produccion/formulas.service.ts`
- Create: `apps/api/src/modulos/produccion/dto/formulas.dto.ts`
- Modify: `apps/api/src/app.module.ts` (registrar `ProduccionModule`)
- Modify: `apps/api/prisma/seed.ts:36-62` (permisos)
- Test: `apps/api/test/formulas.spec.ts`

**Interfaces:**
- Consumes: `CorrelativoService.siguiente(tx, empresaId, "FORMULA")`, `AuditoriaService.registrar`, patrón `cargarSkus` de `vales.service.ts`.
- Produces:

```ts
export interface NuevaFormula {
  nombre: string;
  skuTerminadoId: bigint;
  cantidadBase: string;
  observaciones?: string;
  lineas: Array<{ skuInsumoId: bigint; cantidad: string }>;
}
export class FormulasService {
  listar(empresaId: bigint, filtro?: { activo?: boolean; skuTerminadoId?: bigint }): Promise<FormulaResumen[]>;
  obtener(empresaId: bigint, id: bigint): Promise<FormulaDetalle>;      // 404 si no es de la empresa
  crear(usuario: UsuarioRequest, datos: NuevaFormula): Promise<{ id: string; codigo: string }>;
  actualizar(usuario: UsuarioRequest, id: bigint, datos: Partial<NuevaFormula>): Promise<{ id: string }>; // lineas reemplaza el conjunto completo
  darDeBaja(usuario: UsuarioRequest, id: bigint): Promise<{ id: string }>;   // activo = false
  reactivar(usuario: UsuarioRequest, id: bigint): Promise<{ id: string }>;
}
```

`FormulaDetalle = { id, codigo, nombre, cantidadBase, activo, observaciones, skuTerminado: SkuRef, lineas: Array<{ id, cantidad, skuInsumo: SkuRef }> }` con `SkuRef = { id, codigoParlante, nombre, unidad }` (mismo shape que devuelve `mapearVale` para sus SKUs). `FormulaResumen` = detalle sin `lineas` más `cantidadInsumos`.

DTOs: `LineaFormulaDto { skuInsumoId: number (@IsInt); cantidad: string (@Matches REGEX_DECIMAL) }`, `CrearFormulaDto { nombre (@IsString @IsNotEmpty @MaxLength(120)); skuTerminadoId (@IsInt); cantidadBase (@Matches); observaciones? (@IsOptional @IsString); lineas (@ValidateNested @Type @ArrayMinSize(1)) }`, `ActualizarFormulaDto` = todos opcionales.

Validaciones del servicio: SKU terminado o insumo que no es de la empresa → 404; SKU inactivo → 400; insumo igual al terminado → 400 `"Un insumo no puede ser el mismo producto terminado"`; insumo repetido → 400. Auditoría con `entidad: "FORMULA"` y acciones `CREAR`, `ACTUALIZAR`, `BAJA`, `REACTIVAR`.

Controlador `@Controller("formulas")`, `@UseGuards(JwtGuard, PermisosGuard)`, todas las rutas con `@Permisos("formula.gestionar")`: `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `POST /:id/baja`, `POST /:id/reactivar`. Ids con `BigInt(id)` como en `ordenes-trabajo.controller.ts`.

Permisos a agregar al catálogo (esta tarea agrega los tres): `formula.gestionar` "Gestionar fórmulas de producción", `produccion.gestionar` "Gestionar órdenes de producción", `produccion.cerrar` "Cerrar órdenes de producción (ingreso valorizado)".

- [ ] **Paso 1: Escribir los tests que fallan**

```ts
it("rechaza por DTO cantidadBase cero y lineas vacías", ...);       // validarCuerpo(CrearFormulaDto, ...)
it("crea una fórmula con código correlativo y la devuelve con sus líneas", ...); // codigo definido, lineas.length === 2
it("rechaza un insumo igual al terminado con 400", ...);
it("rechaza un insumo repetido con 400", ...);
it("devuelve 404 si el SKU no es de la empresa", ...);                // skuTerminadoId 999999999n
it("actualizar reemplaza el conjunto de líneas", ...);                // de 2 líneas a 1
it("dar de baja y reactivar cambian activo", ...);
```

- [ ] **Paso 2: Verificar que fallan**

Run: `pnpm --filter @bm/api test -- test/formulas.spec.ts`
Expected: FAIL por módulo inexistente.

- [ ] **Paso 3: Implementar DTOs, servicio, controlador y módulo; registrar en `app.module.ts`; agregar permisos al seed**

`ProduccionModule` importa `[AuthModule, AuditoriaModule, CorrelativoModule, InventarioModule]`.

- [ ] **Paso 4: Verificar que pasan y lint**

Run: `pnpm --filter @bm/api lint && pnpm --filter @bm/api test -- test/formulas.spec.ts`
Expected: PASS.

- [ ] **Paso 5: Sembrar permisos en local**

Confirmar que `seed.ts` solo hace `upsert` (L132-154) y correr `pnpm --filter @bm/api db:seed`. Expected: ADMIN queda con los tres permisos nuevos.

- [ ] **Paso 6: Commit**

```bash
git add apps/api/src/modulos/produccion apps/api/src/app.module.ts apps/api/prisma/seed.ts apps/api/test/formulas.spec.ts
git commit -m "feat(produccion): API de fórmulas con permiso formula.gestionar"
```

---

### Task 4: Vales de salida vinculados a una orden de producción

**Files:**
- Modify: `apps/api/src/modulos/vales/vales.service.ts` (`NuevoValeSalida` L16-30, `crear` ~L157, `despachar` ~L301, `mapearVale`)
- Modify: `apps/api/src/modulos/vales/dto/vales.dto.ts` (`CrearValeSalidaDto`)
- Modify: `apps/api/src/modulos/vales/vales.controller.ts` (pasar `ordenProduccionId`)
- Modify: `apps/api/src/modulos/vales/vales.module.ts` (`exports: [ValesService]`)
- Test: `apps/api/test/ordenes-produccion.spec.ts` (se crea aquí y crece en las tareas 5 y 6)

**Interfaces:**
- Produces: `NuevoValeSalida.ordenProduccionId?: bigint` (exportar la interfaz); `CrearValeSalidaDto.ordenProduccionId?: number` (`@IsOptional @IsInt`); respuesta de vale con `ordenProduccion: { id: string; numero: string } | null`.

Reglas en `crear`: orden inexistente o de otra empresa → 404; estado fuera de `PLANIFICADA`/`EN_PROCESO` → 400 `"La orden de producción no admite nuevos vales"`; si el DTO no trae `ordenTrabajoId` y la orden tiene uno, se hereda.

Reglas en `despachar`, dentro de la `$transaction` existente y antes de mover stock, solo si el vale tiene `ordenProduccionId`: `await tx.$queryRaw\`SELECT id FROM orden_produccion WHERE id = ${id} FOR UPDATE\``; releer estado; fuera de `PLANIFICADA`/`EN_PROCESO` → `ConflictException("La orden de producción ya no admite despachos")`; tras despachar las líneas: `tx.ordenProduccion.updateMany({ where: { id, estado: "PLANIFICADA" }, data: { estado: "EN_PROCESO" } })`.

- [ ] **Paso 1: Escribir los tests que fallan**

En `beforeAll`, además del setup de `vale.spec.ts`, crear una fórmula mínima y una `OrdenProduccion` directamente con `prisma.ordenProduccion.create` (estado `PLANIFICADA`, con `ordenTrabajoId` de una OT creada con `prisma.ordenTrabajo.create`).

```ts
it("crea un vale contra la orden y hereda la orden de trabajo", ...); // ordenProduccionId y ordenTrabajoId coinciden con la orden
it("rechaza con 404 una orden de otra empresa o inexistente", ...);
it("rechaza con 400 una orden CERRADA", ...);                          // setear estado por prisma
it("despachar pasa la orden de PLANIFICADA a EN_PROCESO", ...);
it("despachar contra una orden CERRADA lanza Conflict", ...);
```

- [ ] **Paso 2: Verificar que fallan**

Run: `pnpm --filter @bm/api test -- test/ordenes-produccion.spec.ts`
Expected: FAIL (campo desconocido / estado no cambia).

- [ ] **Paso 3: Implementar DTO, servicio, controlador y exportación del módulo**

- [ ] **Paso 4: Verificar que pasan junto con la suite de vales**

Run: `pnpm --filter @bm/api lint && pnpm --filter @bm/api test -- test/ordenes-produccion.spec.ts test/vale.spec.ts`
Expected: PASS.

- [ ] **Paso 5: Commit**

```bash
git add apps/api/src/modulos/vales apps/api/test/ordenes-produccion.spec.ts
git commit -m "feat(vales): vincular vales de salida a órdenes de producción"
```

---

### Task 5: API de órdenes de producción (crear, consultar, generar vale, anular)

**Files:**
- Create: `apps/api/src/modulos/produccion/ordenes-produccion.service.ts`
- Create: `apps/api/src/modulos/produccion/ordenes-produccion.controller.ts`
- Create: `apps/api/src/modulos/produccion/dto/ordenes-produccion.dto.ts`
- Modify: `apps/api/src/modulos/produccion/produccion.module.ts` (importar `ValesModule`, registrar servicio y controlador)
- Test: `apps/api/test/ordenes-produccion.spec.ts`

**Interfaces:**
- Consumes: `ValesService.crear(usuario, NuevoValeSalida)` (Tarea 4), `FormulasService` (Tarea 3), regla de OT abierta de `vales.service.ts:168-178`.
- Produces:

```ts
export interface NuevaOrdenProduccion {
  formulaId: bigint; cantidadPlanificada: string;
  almacenInsumosId: bigint; almacenDestinoId: bigint; centroCostoId: bigint;
  ordenTrabajoId?: bigint; observaciones?: string;
}
export interface ConsumoOrden {
  lineas: Array<{ skuInsumo: SkuRef; cantidadPlanificada: string; cantidadEnCurso: string; cantidadConsumida: string; cantidadPendiente: string; costoConsumido: string }>;
  fueraDeFormula: Array<{ skuInsumo: SkuRef; cantidadConsumida: string; costoConsumido: string }>;
  costoTotalConsumido: string;
}
export class OrdenesProduccionService {
  listar(empresaId: bigint, filtro?: { estado?: EstadoOrdenProduccion }): Promise<OrdenProduccionResumen[]>;
  obtener(empresaId: bigint, id: bigint): Promise<OrdenProduccionDetalle>;   // cabecera + ConsumoOrden + vales[{id, numero, estado}]
  crear(usuario: UsuarioRequest, datos: NuevaOrdenProduccion): Promise<{ id: string; numero: string }>;
  generarVale(usuario: UsuarioRequest, id: bigint): Promise<{ valeId: string }>;
  anular(usuario: UsuarioRequest, id: bigint): Promise<{ id: string }>;
  // privado, reutilizado por cerrar (Tarea 6):
  // calcularConsumo(db: Prisma.TransactionClient | PrismaService, empresaId: bigint, ordenId: bigint): Promise<ConsumoOrden & { idsValesDespachados: bigint[]; hayValesEnCurso: boolean }>
}
```

Reglas de `crear`: fórmula de otra empresa → 404, inactiva → 400; almacenes y centro de costo de la empresa → 404 si no; OT de otra empresa → 404, cerrada → 400; SKU terminado inactivo → 400. Explosión: `cantidadPlanificada = D(linea.cantidad).mul(planificada).div(cantidadBase).toDecimalPlaces(8)`. Correlativo `"ORDEN_PRODUCCION"`. Copia `skuTerminadoId` de la fórmula. Auditoría `entidad: "ORDEN_PRODUCCION"`, acciones `CREAR`, `GENERAR_VALE`, `ANULAR`.

`calcularConsumo`: consumida y costo por SKU con `movimientoStock.groupBy({ by: ["skuId"], where: { empresaId, documentoTipo: "VALE_SALIDA", documentoId: { in: idsValesDespachados } }, _sum: { cantidad: true, costoTotal: true } })`; en curso por SKU sumando `valeSalidaLinea.cantidad` de vales en `BORRADOR`/`AUTORIZADO`; pendiente `= planificada − consumida − enCurso`, nunca negativa; SKUs consumidos que no están en la fórmula van a `fueraDeFormula`.

`generarVale`: estado fuera de `PLANIFICADA`/`EN_PROCESO` → 400; líneas con pendiente > 0; ninguna → 400 `"No hay insumos pendientes de entregar"`; llama a `vales.crear(usuario, { almacenId: almacenInsumosId, centroCostoId, ordenTrabajoId, ordenProduccionId: id, destino: \`Orden de producción ${numero}\`, lineas })`.

`anular`: CAS `PLANIFICADA → ANULADA`; si existe un vale con `ordenProduccionId = id` y `estado != ANULADO` → 400 `"La orden tiene vales vinculados"`.

Controlador `@Controller("ordenes-produccion")`: `GET /` (`produccion.gestionar`, query `estado`), `GET /:id` (`produccion.gestionar`), `POST /` (`produccion.gestionar`), `POST /:id/generar-vale` (`@Permisos("produccion.gestionar", "vale.crear")`), `POST /:id/anular` (`produccion.gestionar`). DTO `CrearOrdenProduccionDto` con los campos de `NuevaOrdenProduccion` (ids `@IsInt`, cantidad `@Matches`).

- [ ] **Paso 1: Escribir los tests que fallan**

Setup: dos insumos A y B con stock por `movimientos.recibirCompra` (A: 100 a 5; B: 100 a 2), SKU terminado T, fórmula base `"10"` con A `"25"` y B `"10"`.

```ts
it("explota la fórmula y congela las líneas", ...);                 // planificada "4" → A "10", B "4"
it("redondea a 8 decimales un periódico", ...);                     // fórmula base "3", insumo "1", planificada "1" → "0.33333333"
it("rechaza fórmula inactiva y OT cerrada con 400", ...);
it("generar vale crea un BORRADOR con las líneas pendientes", ...); // 2 líneas, ordenProduccionId, destino con el número
it("un segundo generar vale sin pendiente responde 400", ...);
it("tras despachar, obtener muestra consumido, costo y EN_PROCESO", ...); // A: consumida "10", costo "50.00"; B: "4", "8.00"; costoTotalConsumido "58.00"
it("editar la fórmula no cambia las líneas de la orden", ...);
it("anular solo desde PLANIFICADA sin vales", ...);                  // EN_PROCESO → Conflict; con vale BORRADOR → 400
```

- [ ] **Paso 2: Verificar que fallan**

Run: `pnpm --filter @bm/api test -- test/ordenes-produccion.spec.ts`
Expected: FAIL por servicio inexistente.

- [ ] **Paso 3: Implementar DTO, servicio, controlador y cambios de módulo**

- [ ] **Paso 4: Verificar que pasan y lint**

Run: `pnpm --filter @bm/api lint && pnpm --filter @bm/api test -- test/ordenes-produccion.spec.ts`
Expected: PASS.

- [ ] **Paso 5: Commit**

```bash
git add apps/api/src/modulos/produccion apps/api/test/ordenes-produccion.spec.ts
git commit -m "feat(produccion): API de órdenes de producción con generación de vales"
```

---

### Task 6: Cierre de la orden con ingreso valorizado

**Files:**
- Modify: `apps/api/src/modulos/produccion/ordenes-produccion.service.ts`
- Modify: `apps/api/src/modulos/produccion/ordenes-produccion.controller.ts` (`POST /:id/cerrar`, `@Permisos("produccion.cerrar")`)
- Modify: `apps/api/src/modulos/produccion/dto/ordenes-produccion.dto.ts` (`CerrarOrdenProduccionDto`)
- Test: `apps/api/test/ordenes-produccion.spec.ts`

**Interfaces:**
- Consumes: `MovimientoService.entradaPorProduccionEnTx` (Tarea 2), `calcularConsumo` (Tarea 5).
- Produces:

```ts
cerrar(usuario: UsuarioRequest, id: bigint, datos: { cantidadProducida: string; almacenDestinoId?: bigint; observaciones?: string })
  : Promise<{ movimientoId: string; costoTotalInsumos: string; costoUnitarioTerminado: string }>
```

`CerrarOrdenProduccionDto { cantidadProducida (@Matches REGEX_DECIMAL); almacenDestinoId? (@IsOptional @IsInt); observaciones? }`.

Dentro de una `$transaction`: `SELECT id FROM orden_produccion WHERE id = ${id} AND empresa_id = ${empresaId} FOR UPDATE` (vacío → 404); estado `PLANIFICADA` → 400 `"La orden no tiene consumo registrado"`, `CERRADA`/`ANULADA` → `ConflictException`; `hayValesEnCurso` → 400 `"Hay vales pendientes de despachar o anular"`; `costoTotalInsumos = Σ costoTotal` de los movimientos de los vales despachados (`_sum.costoTotal`), cero → 400; SKU terminado con `controlaSerie` → 400 `"No se admite producto terminado con control de serie"`; `controlaLote`: si `aplicarEntrada` acepta lote, exigir lote y vencimiento en el DTO; si no, 400 `"No se admite producto terminado con control de lote en esta versión"` (decisión del implementador, documentada en el commit); `almacenDestinoId` del DTO reemplaza al de la orden tras validar pertenencia (404); `entradaPorProduccionEnTx(usuario, tx, { skuId: skuTerminadoId, almacenId, cantidad, costoTotal: costoTotalInsumos.toString(), documentoId: id, observaciones })`; actualizar la orden con `cantidadProducida`, `costoTotalInsumos`, `costoUnitarioTerminado`, `movimientoEntradaId`, `fechaCierre = now()`, `estado = CERRADA`; auditoría `CERRAR`.

- [ ] **Paso 1: Escribir los tests que fallan**

Flujo base: fórmula base `"1"` con A `"2"` y B `"1"`; orden planificada `"10"`; generar vale, autorizar y despachar con `autorizador`.

```ts
it("cierra con costo = suma del ledger y crea la entrada del terminado", ...);
// consumo A 20 a 5 = 100, B 10 a 2 = 20 → costoTotalInsumos "120.00"; cantidadProducida "8" → costoUnitarioTerminado "15"
// movimiento: tipo ENTRADA_PRODUCCION, documentoTipo ORDEN_PRODUCCION, documentoId = orden; capa 8 a 15; stock de T +8; orden CERRADA
it("usa el promedio del ledger, no FIFO", ...);
// insumo C con compras 50 a 4 y 50 a 6; fórmula C "2"; orden "10" → salida 20 vale 100 en el ledger; cerrar "10" → costoUnitario "10" (FIFO daría 80 → 8)
it("incluye en el costo un vale manual con un SKU fuera de fórmula", ...);
// vale manual con ordenProduccionId y SKU D (10 a 3): obtener.fueraDeFormula tiene D; cerrar suma 30 más
it("rechaza el cierre con un vale AUTORIZADO pendiente", ...);           // 400, sin movimiento nuevo
it("rechaza el cierre en PLANIFICADA y repetido en CERRADA", ...);        // 400 y Conflict
it("rechaza por DTO cantidadProducida cero", ...);
```

- [ ] **Paso 2: Verificar que fallan**

Run: `pnpm --filter @bm/api test -- test/ordenes-produccion.spec.ts`
Expected: FAIL, `cerrar is not a function`.

- [ ] **Paso 3: Implementar `cerrar`, DTO y ruta**

- [ ] **Paso 4: Verificar toda la suite de la API y lint**

Run: `pnpm --filter @bm/api lint && pnpm --filter @bm/api test`
Expected: PASS completo.

- [ ] **Paso 5: Commit**

```bash
git add apps/api/src/modulos/produccion apps/api/test/ordenes-produccion.spec.ts
git commit -m "feat(produccion): cierre de orden con ingreso valorizado del terminado"
```

---

### Task 7: Pantalla de fórmulas

**Files:**
- Modify: `apps/web/src/lib/api.ts` (tipos y funciones, junto a `crearOrdenTrabajo` ~L1651)
- Modify: `apps/web/src/lib/modulos.ts:41-111` (nuevo grupo)
- Create: `apps/web/src/app/panel/formulas/page.tsx`

**Interfaces:**
- Consumes: rutas de la Tarea 3.
- Produces en `api.ts`: tipos `SkuRef`, `FormulaLinea`, `Formula`, `FormulaResumen`, `CrearFormulaInput`, `ActualizarFormulaInput`; funciones `obtenerFormulas(filtro?)`, `obtenerFormula(id)`, `crearFormula(datos)`, `actualizarFormula(id, datos)`, `darDeBajaFormula(id)`, `reactivarFormula(id)`, tipadas como `crearOrdenTrabajo`.
- Grupo de navegación nuevo, entre "Movimientos" y "Consultas y reportes": `{ titulo: "Producción", color: "movimientos", enlaces: [{ href: "/panel/formulas", etiqueta: "Fórmulas" }, { href: "/panel/ordenes-produccion", etiqueta: "Órdenes de producción" }] }`. Si `color` admite solo valores fijos, reutilizar `"movimientos"`.

Página: patrón de `familias/page.tsx` (lista + `PanelLateral` de formulario) y selector de SKU como el que usa `vales/page.tsx`. Lista: código, nombre, SKU terminado, cantidad base, cantidad de insumos, estado. Formulario: nombre, SKU terminado, cantidad base, observaciones, tabla editable de insumos (SKU, cantidad, quitar) con al menos una línea. Acciones: crear, editar, dar de baja y reactivar con `ModalConfirmacion`. Textos en español neutro; errores del API mostrados con el patrón de la página de referencia; accesibilidad: labels asociados, foco gestionado por `PanelLateral`.

- [ ] **Paso 1: Agregar tipos, funciones y entrada de navegación**
- [ ] **Paso 2: Implementar la página**
- [ ] **Paso 3: Verificar tipos y lint**

Run: `pnpm --filter @bm/web exec tsc --noEmit && pnpm --filter @bm/web lint`
Expected: sin errores.

- [ ] **Paso 4: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/src/lib/modulos.ts apps/web/src/app/panel/formulas
git commit -m "feat(web): pantalla de fórmulas de producción"
```

---

### Task 8: Pantalla de órdenes de producción

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Create: `apps/web/src/app/panel/ordenes-produccion/page.tsx`

**Interfaces:**
- Consumes: rutas de las Tareas 5 y 6; `obtenerFormulas`, `obtenerCentrosCosto`, `obtenerOrdenesTrabajo`, selector de almacén usado en `vales/page.tsx`.
- Produces en `api.ts`: tipos `EstadoOrdenProduccion`, `OrdenProduccionResumen`, `OrdenProduccionDetalle` (con `consumo: { lineas, fueraDeFormula, costoTotalConsumido }` y `vales`), `CrearOrdenProduccionInput`, `CerrarOrdenProduccionInput`; funciones `obtenerOrdenesProduccion(filtro?)`, `obtenerOrdenProduccion(id)`, `crearOrdenProduccion(datos)`, `generarValeOrdenProduccion(id)`, `cerrarOrdenProduccion(id, datos)`, `anularOrdenProduccion(id)`.

Página: lista con filtro por estado (número, fórmula, SKU terminado, planificado, producido, estado, fecha). Alta en `PanelLateral`: fórmula (muestra SKU terminado y cantidad base al elegir), cantidad a producir, almacén de insumos, almacén destino, centro de costo, orden de trabajo opcional, observaciones. Detalle en `PanelLateral ancho="detalle"` con `Ficha`, `BloqueMetricas`/`Metrica` (planificado, producido, costo de insumos, costo unitario) y `TablaResponsive` de insumos (planificado, en curso, consumido, pendiente, costo) más la sección "Consumo fuera de fórmula" cuando exista y la lista de vales con su estado. Acciones según estado: "Generar vale" (`PLANIFICADA`/`EN_PROCESO`), "Cerrar orden" (`EN_PROCESO`) con `ModalConfirmacion` que incluye cantidad producida y almacén destino, "Anular" (`PLANIFICADA`).

- [ ] **Paso 1: Agregar tipos y funciones**
- [ ] **Paso 2: Implementar la página**
- [ ] **Paso 3: Verificar tipos y lint**

Run: `pnpm --filter @bm/web exec tsc --noEmit && pnpm --filter @bm/web lint`
Expected: sin errores.

- [ ] **Paso 4: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/src/app/panel/ordenes-produccion
git commit -m "feat(web): pantalla de órdenes de producción"
```

---

### Task 9: Verificación final de la rama

- [ ] **Paso 1: Suite completa**

Run: `pnpm lint && pnpm test`
Expected: todo en verde.

- [ ] **Paso 2: Revisión de rama con contexto fresco** (la hace el orquestador con un revisor independiente antes de proponer el PR).
