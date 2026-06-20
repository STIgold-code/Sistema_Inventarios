/**
 * Reset transaccional para GO-LIVE.
 *
 * Deja la base lista para operacion real: borra TODA la data transaccional
 * (movimientos del ledger, documentos, proyecciones de stock, auditoria) y
 * conserva los MAESTROS (empresa, sucursales, almacenes, usuarios, roles,
 * permisos, familias, productos, SKUs, unidades, centros de costo, catalogos).
 *
 * Usa TRUNCATE, que NO dispara el trigger de inmutabilidad del ledger
 * (ese trigger es BEFORE UPDATE/DELETE, no BEFORE TRUNCATE).
 *
 * USO (contra la base que apunte DATABASE_URL):
 *   tsx prisma/reset-transaccional.ts
 *
 * PELIGRO: borra el stock importado tambien. Correr SOLO antes del go-live
 * o cuando se quiera una pizarra limpia. Hacer backup antes en produccion.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Tablas transaccionales a vaciar (en el orden no importa por CASCADE).
const TABLAS_TRANSACCIONALES = [
  "registro_auditoria",
  "consumo_capa",
  "capa_costo",
  "movimiento_stock",
  "item_stock",
  "saldo_periodo",
  "cierre_periodo",
  "conteo_linea",
  "conteo",
  "recepcion_linea",
  "recepcion",
  "orden_compra_linea",
  "orden_compra",
  "requerimiento_compra_linea",
  "requerimiento_compra",
  "vale_salida_linea",
  "vale_salida",
  "devolucion_venta_linea",
  "devolucion_venta",
  "comprobante_venta",
  "orden_venta_linea",
  "orden_venta",
  "guia_remision",
  "traslado_linea",
  "traslado",
  "cotizacion_proveedor",
  "documento_correlativo",
];

async function main(): Promise<void> {
  // Solo las tablas que existan realmente en el esquema actual.
  const existentes = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
  `;
  const set = new Set(existentes.map((t) => t.table_name));
  const aVaciar = TABLAS_TRANSACCIONALES.filter((t) => set.has(t));

  const lista = aVaciar.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE;`,
  );

  console.log("Reset transaccional completado. Tablas vaciadas:");
  for (const t of aVaciar) console.log(`  - ${t}`);
  console.log(
    "\nMaestros conservados (productos, familias, almacenes, usuarios, catalogos).",
  );
  console.log("La base quedo lista para cargar el stock inicial real.");
}

main()
  .catch((e) => {
    console.error("Error en el reset:", e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
