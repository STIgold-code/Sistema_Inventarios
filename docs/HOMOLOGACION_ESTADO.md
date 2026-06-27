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
| 26 | **Vendedor** | `31ce3dc` | Maestro + FK en Cliente/OrdenVenta. Permiso `venta.gestionar`. |
| 27 | **Transportistas** | `2abac4d` | Maestro + FK opcional en GuiaRemision con snapshot. Permiso `guia.gestionar`. |
| 31 | **Entrada por producción** | `f90b0ec` | `ENTRADA_PRODUCCION` (op 10), `POST /inventario/produccion`. |
| 33 | **Reportes faltantes** | `70d0887` | antiguedadStock, proyeccionCompra, kardexAnual + rentabilidad por vendedor/línea. Pantallas nuevas. Permiso `reporte.ver`. (FALTA solo el Formato 9.1, que depende de consignación.) |
| 28 | **Devolución a proveedor** | `3d8875e` | `SALIDA_DEVOLUCION_PROVEEDOR` (op 06), módulo devoluciones-proveedor (registrar+listar). Permiso `compra.gestionar`. MVP sin anular. |
| 29 | **Transferencia de código** | `b75d115` | `SALIDA/ENTRADA_TRANSFORMACION` (op 10), módulo transferencias-codigo (crear+listar), conserva valor FIFO real. Rechaza serializados. MVP sin anular. |
| 34 | **Parametrización (IGV editable)** | `209a1fb` | Tabla `ParametrosEmpresa` + ParametrosService (`tasaIgv`/`tasaIgvEnTx`). IGV deja de ser constante: ventas/compras lo toman de parámetros. Pantalla en Utilitarios. **DEFERIDO del #34: gestor de series de comprobante** (sobre DocumentoCorrelativo, tipos COMPROBANTE_FACTURA/BOLETA/NC/ND, permiso venta.gestionar) — ver spec parametrizacion-utilitarios. |

| 30 | **Pedido** | `57201e4` | Documento Pedido (crear/aprobar/anular/listar) con control atendido/por atender. `Generar orden de venta` desde el pedido → marca ATENDIDO. Permiso venta.gestionar. MVP atención total. |

---

## Pendiente (último — el más grande)

### consignacion [XL]  →  luego  formato-9-1 [S]
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
