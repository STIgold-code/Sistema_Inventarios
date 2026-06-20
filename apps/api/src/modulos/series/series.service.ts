import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../comun/prisma/prisma.service.js";

@Injectable()
export class SeriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lista las series de la empresa. Filtra opcionalmente por SKU y/o estado
   * (DISPONIBLE / DESPACHADO). Solo devuelve series de la empresa (anti-IDOR).
   */
  async listar(
    empresaId: bigint,
    filtros: { skuId?: bigint; estado?: string },
  ) {
    const where: Prisma.SerieArticuloWhereInput = { empresaId };
    if (filtros.skuId !== undefined) where.skuId = filtros.skuId;
    if (filtros.estado !== undefined) {
      where.estado = filtros.estado as Prisma.SerieArticuloWhereInput["estado"];
    }

    const series = await this.prisma.serieArticulo.findMany({
      where,
      include: {
        sku: { select: { codigoParlante: true, nombre: true } },
        almacen: { select: { nombre: true } },
      },
      orderBy: [{ skuId: "asc" }, { numeroSerie: "asc" }],
    });

    return series.map((s) => ({
      id: s.id.toString(),
      skuId: s.skuId.toString(),
      codigoParlante: s.sku.codigoParlante,
      skuNombre: s.sku.nombre,
      numeroSerie: s.numeroSerie,
      estado: s.estado,
      almacenId: s.almacenId ? s.almacenId.toString() : null,
      almacen: s.almacen ? s.almacen.nombre : null,
      movimientoEntradaId: s.movimientoEntradaId
        ? s.movimientoEntradaId.toString()
        : null,
      movimientoSalidaId: s.movimientoSalidaId
        ? s.movimientoSalidaId.toString()
        : null,
      creadoEn: s.creadoEn.toISOString(),
    }));
  }
}
