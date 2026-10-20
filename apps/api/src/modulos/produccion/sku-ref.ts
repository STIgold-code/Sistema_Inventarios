import type { Prisma } from "@prisma/client";
import type { PrismaService } from "../../comun/prisma/prisma.service.js";

/** Referencia a un SKU en las respuestas de la API. */
export interface SkuRef {
  id: string;
  codigoParlante: string;
  nombre: string;
  /** Código de la unidad de control (Tabla 6 SUNAT). */
  unidad: string;
}

/**
 * Mapa skuId -> SkuRef para enriquecer cabeceras y líneas (patrón de vales).
 * Las columnas de SKU de producción no tienen relación Prisma: se cargan aparte
 * en una sola consulta, siempre acotada a la empresa.
 */
export async function cargarSkuRefs(
  db: Prisma.TransactionClient | PrismaService,
  empresaId: bigint,
  ids: bigint[],
): Promise<Map<string, SkuRef>> {
  if (ids.length === 0) return new Map();
  const skus = await db.sku.findMany({
    where: { empresaId, id: { in: [...new Set(ids)] } },
    include: { producto: true, unidad: true },
  });
  return new Map(
    skus.map((s) => [
      s.id.toString(),
      {
        id: s.id.toString(),
        codigoParlante: s.codigoParlante,
        nombre: s.nombre ?? s.producto.nombre,
        unidad: s.unidad.codigo,
      },
    ]),
  );
}

/** Mismo criterio de respaldo que `mapearVale` si el SKU no se encuentra. */
export function referenciaSku(skuId: bigint, skus: Map<string, SkuRef>): SkuRef {
  return (
    skus.get(skuId.toString()) ?? {
      id: skuId.toString(),
      codigoParlante: "",
      nombre: `SKU ${skuId}`,
      unidad: "",
    }
  );
}
