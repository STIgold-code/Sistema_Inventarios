# Diseño: fórmulas de producción y órdenes de producción

Fecha: 2026-10-16
Estado: propuesta pendiente de aprobación
Origen: análisis competitivo de GECOPE (`reports/Análisis del sistema Gecope.md`), rescatable n.º 1.

## Intención

BM fabrica. Hoy el sistema registra el ingreso de producto terminado con `POST /inventario/produccion`, que recibe un `costoUnitario` tipeado a mano, y los insumos salen por vales de salida sueltos contra una orden de trabajo. No existe vínculo entre lo que se consumió y lo que se produjo, por lo que el kardex valorizado (Formato 13.1) recibe un costo inventado para el producto terminado.

Esta funcionalidad agrega la **fórmula** (lista de insumos por unidad de producto terminado) y la **orden de producción** que planifica el consumo, lo ejecuta mediante los vales de salida existentes y, al cerrar, ingresa el producto terminado con el costo real de los insumos consumidos.

## Objetivos

- Definir fórmulas por SKU terminado, reutilizables, con cantidad base y líneas de insumo.
- Crear órdenes de producción desde una fórmula, con la explosión de insumos congelada en la orden.
- Entregar los insumos por el flujo de vales existente (borrador, autorización, despacho, impresión, segregación de funciones).
- Cerrar la orden ingresando el producto terminado con costo igual al valor con que los insumos salieron del kardex.
- Mantener la trazabilidad: desde el movimiento de entrada se llega a la orden; desde la orden, a sus vales y a sus movimientos de salida.

## No objetivos

- Producción con varios productos de salida o subproductos (una fórmula produce un solo SKU).
- Cierres parciales (varias entradas por orden). Una orden se cierra una sola vez.
- Costos de mano de obra o indirectos. El costo del terminado es solo el de los insumos.
- Mermas estándar en la fórmula. La merma real queda capturada por el consumo real.
- Lotes de producción fallida o scrap como concepto propio.
- Retirar el ingreso manual de producción existente. Se mantiene y se evalúa después.
- Formato impreso de la orden de producción (el vale ya tiene impresión).

## Anti objetivos

- Que la fórmula editada cambie órdenes históricas. Por eso la orden congela sus cantidades.
- Que el cierre tome un costo distinto al que el ledger ya descontó por los insumos. Rompería la conservación de valor del inventario.
- Que el consumo de insumos salte el flujo de vales (autorización y segregación). En una planta eso es un hueco de control.

## Restricciones

- Stack y convenciones existentes: NestJS + Prisma + PostgreSQL, Next.js, identificadores y textos en español neutro.
- El ledger (`MovimientoStock`) es inmutable; cualquier corrección es un movimiento inverso.
- Método de valuación vigente: promedio móvil. `aplicarSalida` registra las salidas al costo promedio y `ConsumoCapa` guarda el detalle FIFO interno.
- Multi-tenant por `empresaId` en toda consulta y escritura. Propiedad cruzada devuelve 404.
- Periodos cerrados rechazan movimientos (`PeriodoCerradoError`).

## Modelo de datos

### `Formula`

| Campo | Tipo | Nota |
|---|---|---|
| id | BigInt | |
| empresaId | BigInt | |
| codigo | String | correlativo `FORMULA`, único por empresa |
| nombre | String | |
| skuTerminadoId | BigInt | SKU que produce |
| cantidadBase | Decimal(20,8) | cantidad de terminado que rinde la receta, > 0 |
| activo | Boolean | baja lógica |
| observaciones | String? | |
| creadoEn, actualizadoEn | DateTime | |

Índices: `@@unique([empresaId, codigo])`, `@@index([empresaId, skuTerminadoId])`. Se permiten varias fórmulas activas para un mismo SKU terminado (recetas alternativas); la orden elige una.

### `FormulaLinea`

| Campo | Tipo | Nota |
|---|---|---|
| id, empresaId, formulaId | BigInt | borrado en cascada con la fórmula |
| skuInsumoId | BigInt | distinto de `skuTerminadoId` |
| cantidad | Decimal(20,8) | por `cantidadBase`, en unidad de control del insumo, > 0 |

`@@unique([formulaId, skuInsumoId])`.

La fórmula es una plantilla editable. Editarla no afecta órdenes existentes porque la orden congela su propia explosión.

### `OrdenProduccion`

| Campo | Tipo | Nota |
|---|---|---|
| id, empresaId | BigInt | |
| numero | String | correlativo `ORDEN_PRODUCCION`, único por empresa |
| formulaId | BigInt | fórmula usada |
| skuTerminadoId | BigInt | copiado de la fórmula al crear |
| cantidadPlanificada | Decimal(20,8) | > 0 |
| cantidadProducida | Decimal(20,8)? | se fija al cerrar |
| almacenInsumosId | BigInt | almacén por defecto para el vale generado |
| almacenDestinoId | BigInt | almacén donde entra el terminado |
| centroCostoId | BigInt | se copia al vale generado |
| ordenTrabajoId | BigInt? | imputación opcional a una OT abierta; se copia al vale generado |
| estado | EstadoOrdenProduccion | ver máquina de estados |
| costoTotalInsumos | Decimal(20,2)? | se fija al cerrar |
| costoUnitarioTerminado | Decimal(20,8)? | se fija al cerrar |
| movimientoEntradaId | BigInt? | movimiento `ENTRADA_PRODUCCION` del cierre |
| fechaEmision, fechaCierre | DateTime | |
| observaciones | String? | |
| usuarioId | BigInt | quien la creó |

Índices: `@@unique([empresaId, numero])`, `@@index([empresaId, estado])`, `@@index([empresaId, skuTerminadoId])`.

### `OrdenProduccionLinea`

| Campo | Tipo | Nota |
|---|---|---|
| id, empresaId, ordenProduccionId | BigInt | |
| skuInsumoId | BigInt | |
| cantidadPlanificada | Decimal(20,8) | `linea.cantidad × cantidadPlanificada ÷ cantidadBase`, 8 decimales |

`@@unique([ordenProduccionId, skuInsumoId])`. La cantidad consumida **no se persiste**: se calcula desde el ledger, igual que el consumo de la OT (`consumoValorizadoDeOrden`).

### Cambios en modelos existentes

- `ValeSalida.ordenProduccionId BigInt?` con FK e índice `(empresaId, ordenProduccionId)`. Un vale puede pertenecer a una orden de producción. Se expone en `NuevoValeSalida` y en el DTO de `POST /vales` para que el usuario también pueda crear vales manuales contra la orden (consumo extra o desde otro almacén).
- `TipoDocumentoOrigen`: nuevo valor `ORDEN_PRODUCCION`. El movimiento de entrada del cierre usa `documentoTipo = ORDEN_PRODUCCION` y `documentoId = orden.id`. No se reutiliza `PRODUCCION`, porque hoy ese valor guarda el id de una OT y quedaría ambiguo.
- `EstadoOrdenProduccion`: `PLANIFICADA`, `EN_PROCESO`, `CERRADA`, `ANULADA`.

## Flujo

1. **Crear fórmula** (`formula.gestionar`): SKU terminado, cantidad base, líneas. Valida que todos los SKU sean de la empresa y estén activos, que no haya insumo repetido y que el insumo no sea el terminado.
2. **Crear orden** (`produccion.gestionar`): fórmula activa, cantidad planificada, almacén de insumos, almacén destino, centro de costo, OT opcional (abierta). Explota las líneas y las congela. Estado `PLANIFICADA`.
3. **Generar vale** (`produccion.gestionar` y `vale.crear`): crea un `ValeSalida` en `BORRADOR` con `ordenProduccionId`, `almacenId = almacenInsumosId`, `centroCostoId` y `ordenTrabajoId` de la orden. Las líneas son el pendiente por insumo: `planificada − consumida (vales DESPACHADO) − en curso (líneas de vales BORRADOR o AUTORIZADO)`. Si no queda pendiente en ninguna línea, responde 400. Se puede generar más de un vale por orden.
4. **Autorizar y despachar** el vale por el flujo existente. En `despachar`, si el vale tiene `ordenProduccionId`, la orden pasa de `PLANIFICADA` a `EN_PROCESO` con un `updateMany` condicional en la misma transacción. Esa es la única acoplación de vales hacia producción y se hace con Prisma directo para no crear dependencia circular entre módulos.
5. **Cerrar orden** (`produccion.cerrar`): recibe `cantidadProducida > 0` y, opcionalmente, un almacén destino distinto. En una transacción:
   - bloquea la fila de la orden (`SELECT ... FOR UPDATE`) y verifica estado `EN_PROCESO`;
   - rechaza si existe algún vale de la orden en `BORRADOR` o `AUTORIZADO` (primero despachar o anular);
   - toma los movimientos `SALIDA_CONSUMO` con `documentoTipo = VALE_SALIDA` y `documentoId` en los vales `DESPACHADO` de la orden, y suma `costoTotal`;
   - rechaza si la suma es cero;
   - registra la entrada con un nuevo `entradaPorProduccionEnTx` que recibe `costoTotal` y crea la capa a `costoTotal ÷ cantidadProducida`, modelado en `entradaPorTransformacionEnTx`;
   - fija `cantidadProducida`, `costoTotalInsumos`, `costoUnitarioTerminado`, `movimientoEntradaId`, `fechaCierre` y estado `CERRADA`;
   - escribe auditoría (`CERRAR`, `ORDEN_PRODUCCION`).
6. **Anular orden** (`produccion.gestionar`): solo desde `PLANIFICADA` y sin vales vinculados en estado distinto de `ANULADO`.

`despachar` de un vale con `ordenProduccionId` también bloquea la fila de la orden y exige estado `PLANIFICADA` o `EN_PROCESO`, para que no se despache consumo contra una orden que se está cerrando.

## Decisión de costeo

El costo del terminado es la **suma de `MovimientoStock.costoTotal`** de las salidas de los vales despachados, no la suma FIFO de `ConsumoCapa`. Razón: el ledger descontó los insumos al costo promedio; si la entrada usara otra base, el valor total del inventario dejaría de conservarse y el Formato 13.1 mostraría una diferencia inexplicable. Es además coherente con el método declarado (promedio, Tabla 14 código 2) y con el reporte de consumo por OT, que ya suma `costoTotal`.

## Permisos

- `formula.gestionar`: alta, edición y baja de fórmulas.
- `produccion.gestionar`: crear, generar vale y anular órdenes.
- `produccion.cerrar`: cierre con ingreso valorizado.

Se agregan al catálogo `PERMISOS` de `prisma/seed.ts` (ADMIN los recibe al re-ejecutar el seed).

## API

Módulo `apps/api/src/modulos/produccion/` con `produccion.module.ts`, `formulas.controller.ts`, `formulas.service.ts`, `ordenes-produccion.controller.ts`, `ordenes-produccion.service.ts`, `dto/formulas.dto.ts`, `dto/ordenes-produccion.dto.ts`.

- `GET/POST /formulas`, `GET/PATCH /formulas/:id`, `POST /formulas/:id/baja`, `POST /formulas/:id/reactivar`. El PATCH reemplaza el conjunto completo de líneas.
- `GET/POST /ordenes-produccion`, `GET /ordenes-produccion/:id` (incluye planificado, consumido, en curso y costo acumulado por insumo, más líneas consumidas fuera de fórmula), `POST /:id/generar-vale`, `POST /:id/cerrar`, `POST /:id/anular`.
- `ValesModule` exporta `ValesService`. `InventarioModule` ya exporta `MovimientoService`.

## Web

- `panel/formulas/page.tsx`: lista y `PanelLateral` con selector de SKU terminado, cantidad base y tabla editable de insumos (patrón de `familias/page.tsx` y `productos/page.tsx`).
- `panel/ordenes-produccion/page.tsx`: lista con filtro por estado; alta desde fórmula; detalle con `Ficha`, `BloqueMetricas` y `TablaResponsive` mostrando por insumo planificado, en curso, consumido y costo; acciones Generar vale, Cerrar (modal con cantidad producida y almacén destino) y Anular con `ModalConfirmacion`.
- Entradas en `lib/modulos.ts`: "Fórmulas" y "Órdenes de producción" en un grupo "Producción".
- Funciones tipadas en `lib/api.ts` siguiendo `crearOrdenTrabajo`.

## Migraciones

Dos carpetas escritas a mano con SQL idempotente:

1. `..._tipo_documento_orden_produccion`: `ALTER TYPE "TipoDocumentoOrigen" ADD VALUE IF NOT EXISTS 'ORDEN_PRODUCCION'` solo, porque un valor nuevo de enum no puede usarse en la misma transacción que lo crea.
2. `..._produccion_formulas`: enum `EstadoOrdenProduccion`, tablas `formula`, `formula_linea`, `orden_produccion`, `orden_produccion_linea`, columna `vale_salida.orden_produccion_id` con FK e índice.

## Pruebas

Integración con base real, en `apps/api/test/produccion.spec.ts`, siguiendo `vale.spec.ts` (dos usuarios para la segregación) y `homologacion.spec.ts`:

- DTOs por `validarCuerpo` (cantidades como texto con regex, ids enteros).
- Explosión de líneas con redondeo a 8 decimales.
- Generar vale calcula el pendiente descontando despachado y en curso; segundo vale sin pendiente devuelve 400.
- Despachar un vale vinculado pasa la orden a `EN_PROCESO`.
- Cierre: rechaza con vales en curso, rechaza cantidad cero, crea `ENTRADA_PRODUCCION` con `documentoTipo ORDEN_PRODUCCION`, capa con costo unitario igual a `Σ costoTotal ÷ cantidadProducida`, y la orden queda `CERRADA` con sus montos.
- Anular: permitido en `PLANIFICADA` sin vales, rechazado en el resto.
- Aislamiento por empresa: fórmula, orden, SKU y almacén ajenos devuelven 404.

## Lo que queda a criterio de quien construye

- Si `aplicarEntrada` acepta lote, el cierre debe pedir lote y vencimiento cuando el SKU terminado los controla; si no lo acepta, el cierre rechaza con 400 los SKU terminados con control de lote. Los SKU con control de serie se rechazan en esta versión, igual que en transformación.
- Orden de adquisición de los bloqueos consultivos cuando el cierre toca más de una posición (seguir el comentario de `movimiento.service.ts` ~L1733).
- Detalle de la respuesta de `GET /ordenes-produccion/:id` y de los filtros de listado.
- Textos de interfaz, en español neutro.
