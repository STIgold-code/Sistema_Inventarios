/**
 * Importa el stock real de BM Ingenieros desde el Excel de inventario.
 * Uso: tsx prisma/importar-excel.ts "ruta/al/archivo.xlsx" [--dry]
 *
 * Espera la Hoja1 con columnas: CODIGO | DESCRIPCION | FAMILIA | UNI |
 * STOCK DISPON. | STOCK COMPROM. | STOCK FISICO | ...
 */
import { read, utils } from "xlsx";
import { readFileSync } from "node:fs";
import { PrismaService } from "../src/comun/prisma/prisma.service.js";
import { MovimientoService } from "../src/modulos/inventario/movimientos/movimiento.service.js";
import { TiposCambioService } from "../src/modulos/tipos-cambio/tipos-cambio.service.js";
import {
  ImportadorService,
  type FilaImportacion,
} from "../src/modulos/importador/importador.service.js";

async function main(): Promise<void> {
  const ruta = process.argv[2];
  const dryRun = process.argv.includes("--dry");
  if (!ruta) {
    console.error('Uso: tsx prisma/importar-excel.ts "archivo.xlsx" [--dry]');
    process.exit(1);
  }

  const buffer = readFileSync(ruta);
  const libro = read(buffer, { type: "buffer" });
  const hoja = libro.Sheets["Hoja1"] ?? libro.Sheets[libro.SheetNames[0]!]!;
  const matriz = utils.sheet_to_json<unknown[]>(hoja, { header: 1, raw: true });

  // Las filas de articulo tienen un codigo de 14 digitos en la columna 0.
  const filas: FilaImportacion[] = [];
  for (const fila of matriz) {
    const codigo = String(fila[0] ?? "").trim();
    if (!/^\d{14}$/.test(codigo)) continue; // ignora cabeceras y grupos
    filas.push({
      codigoParlante: codigo,
      descripcion: String(fila[1] ?? "").trim(),
      unidadCodigo: String(fila[3] ?? "").trim(),
      stockFisico: String(fila[6] ?? fila[4] ?? "0").trim(),
    });
  }

  console.log(`Filas de articulo detectadas: ${filas.length}`);

  const prisma = new PrismaService();
  await prisma.$connect();
  const importador = new ImportadorService(prisma, new MovimientoService(prisma, new TiposCambioService(prisma)));

  const empresa = await prisma.empresa.findFirstOrThrow();
  const admin = await prisma.usuario.findFirstOrThrow({ where: { empresaId: empresa.id } });
  const almacen = await prisma.almacen.findFirstOrThrow({ where: { empresaId: empresa.id } });
  const usuario = {
    id: admin.id,
    empresaId: empresa.id,
    email: admin.email,
    nombre: admin.nombre,
    permisos: [] as string[],
  };

  const resultado = await importador.importar(usuario, almacen.id, filas, dryRun);

  console.log("=== Resultado de importacion ===");
  console.log(`  Modo: ${dryRun ? "DRY-RUN (sin escribir)" : "REAL"}`);
  console.log(`  Creados: ${resultado.creados}`);
  console.log(`  Actualizados: ${resultado.actualizados}`);
  console.log(`  Con stock inicial: ${resultado.conStock}`);
  console.log(`  Errores: ${resultado.errores.length}`);
  for (const e of resultado.errores.slice(0, 15)) {
    console.log(`    - ${e.codigo}: ${e.motivo}`);
  }
  if (resultado.errores.length > 15) {
    console.log(`    ... y ${resultado.errores.length - 15} mas`);
  }

  await prisma.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
