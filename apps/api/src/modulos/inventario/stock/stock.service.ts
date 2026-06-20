import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../comun/prisma/prisma.service.js";

export interface LineaKardex {
  fecha: string;
  almacen: string;
  tipo: string;
  tipoOperacionSunat: string;
  cantidad: string;
  costoUnitario: string;
  costoTotal: string;
  saldoCantidad: string;
  saldoCostoUnitario: string;
  saldoCostoTotal: string;
  /** Costo unitario en USD del movimiento (null si no habia TC ese dia). */
  costoUnitarioUsd: string | null;
  /** Costo total en USD del movimiento (null si no habia TC ese dia). */
  costoTotalUsd: string | null;
  documento: string;
}

export interface AlmacenItem {
  id: string;
  codigo: string;
  nombre: string;
}

export interface SaldoStock {
  skuId: string;
  almacenId: string;
  cantidadDisponible: string;
  cantidadComprometida: string;
  costoPromedio: string;
}

export interface StockEnAlmacen {
  almacenId: string;
  disponible: string;
  comprometido: string;
}

export interface ExistenciaSku {
  skuId: string;
  codigoParlante: string;
  nombre: string;
  unidad: string;
  stockMinimo: string | null;
  stocks: StockEnAlmacen[];
  totalDisponible: string;
  totalComprometido: string;
}

export interface ExistenciasRespuesta {
  datos: ExistenciaSku[];
  total: number;
  pagina: number;
  porPagina: number;
  almacenes: AlmacenItem[];
}

export interface OpcionesExistencias {
  pagina: number;
  porPagina: number;
  busqueda?: string;
  almacenId?: bigint;
}

@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  /** Almacenes de la empresa (para selectores). */
  async listarAlmacenes(empresaId: bigint): Promise<AlmacenItem[]> {
    const almacenes = await this.prisma.almacen.findMany({
      where: { empresaId },
      orderBy: { codigo: "asc" },
    });
    return almacenes.map((a) => ({
      id: a.id.toString(),
      codigo: a.codigo,
      nombre: a.nombre,
    }));
  }

  /** Kardex (ledger cronologico) de un SKU, opcionalmente filtrado por almacen. */
  async kardex(
    empresaId: bigint,
    skuId: bigint,
    almacenId?: bigint,
  ): Promise<LineaKardex[]> {
    // Cuando se filtra por un almacen, el orden cronologico da saldos coherentes.
    // En vista consolidada (sin almacen) se ordena por almacen y luego fecha.
    const movimientos = await this.prisma.movimientoStock.findMany({
      where: { empresaId, skuId, ...(almacenId ? { almacenId } : {}) },
      orderBy: almacenId
        ? [{ fechaMovimiento: "asc" }, { secuencia: "asc" }]
        : [{ almacenId: "asc" }, { fechaMovimiento: "asc" }, { secuencia: "asc" }],
    });

    const almacenes = new Map(
      (await this.prisma.almacen.findMany({ where: { empresaId } })).map((a) => [
        a.id.toString(),
        a.codigo,
      ]),
    );

    return movimientos.map((m) => ({
      fecha: m.fechaMovimiento.toISOString(),
      almacen: almacenes.get(m.almacenId.toString()) ?? m.almacenId.toString(),
      tipo: m.tipo,
      tipoOperacionSunat: m.tipoOperacionSunat,
      cantidad: m.cantidad.toString(),
      costoUnitario: m.costoUnitario.toString(),
      costoTotal: m.costoTotal.toString(),
      saldoCantidad: m.saldoCantidad.toString(),
      saldoCostoUnitario: m.saldoCostoUnitario.toString(),
      saldoCostoTotal: m.saldoCostoTotal.toString(),
      costoUnitarioUsd: m.costoUnitarioUsd?.toString() ?? null,
      costoTotalUsd: m.costoTotalUsd?.toString() ?? null,
      documento: `${m.tipoDocumentoSunat}-${m.serieComprobante}-${m.numeroComprobante}`,
    }));
  }

  /** Stock actual (proyeccion) de un SKU por almacen. */
  async stockPorSku(empresaId: bigint, skuId: bigint): Promise<SaldoStock[]> {
    const items = await this.prisma.itemStock.findMany({
      where: { empresaId, skuId },
    });
    return items.map((i) => ({
      skuId: i.skuId.toString(),
      almacenId: i.almacenId.toString(),
      cantidadDisponible: i.cantidadDisponible.toString(),
      cantidadComprometida: i.cantidadComprometida.toString(),
      costoPromedio: i.costoPromedio.toString(),
    }));
  }

  /**
   * Existencias de todos los SKUs (paginadas) con su stock por almacen. Alimenta
   * la pantalla de Existencias en sus dos vistas: lista filtrada por almacen y
   * matriz SKU x almacen. Si se pasa almacenId, solo se incluyen los SKUs con
   * stock en ese almacen y sus posiciones se limitan a ese almacen.
   */
  async existencias(
    empresaId: bigint,
    opciones: OpcionesExistencias,
  ): Promise<ExistenciasRespuesta> {
    const { pagina, porPagina, busqueda, almacenId } = opciones;

    const termino = busqueda?.trim();
    const whereSku: Prisma.SkuWhereInput = {
      empresaId,
      activo: true,
      ...(almacenId ? { items: { some: { almacenId } } } : {}),
      ...(termino
        ? {
            OR: [
              { codigoParlante: { contains: termino } },
              { nombre: { contains: termino, mode: "insensitive" } },
              { producto: { is: { nombre: { contains: termino, mode: "insensitive" } } } },
            ],
          }
        : {}),
    };

    const [total, skus, almacenes] = await this.prisma.$transaction([
      this.prisma.sku.count({ where: whereSku }),
      this.prisma.sku.findMany({
        where: whereSku,
        orderBy: { codigoParlante: "asc" },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
        include: {
          producto: { select: { nombre: true } },
          unidad: { select: { codigo: true } },
          items: {
            where: almacenId ? { almacenId } : undefined,
            select: {
              almacenId: true,
              cantidadDisponible: true,
              cantidadComprometida: true,
            },
          },
        },
      }),
      this.prisma.almacen.findMany({ where: { empresaId }, orderBy: { codigo: "asc" } }),
    ]);

    const datos: ExistenciaSku[] = skus.map((sku) => {
      // Una posicion (item_stock) puede repetirse por ubicacion/lote/serie:
      // se agregan por almacen para obtener el saldo del SKU en cada uno.
      const porAlmacen = new Map<string, { disp: Prisma.Decimal; comp: Prisma.Decimal }>();
      let totalDisp = new Prisma.Decimal(0);
      let totalComp = new Prisma.Decimal(0);
      for (const item of sku.items) {
        const clave = item.almacenId.toString();
        const acum =
          porAlmacen.get(clave) ??
          { disp: new Prisma.Decimal(0), comp: new Prisma.Decimal(0) };
        acum.disp = acum.disp.plus(item.cantidadDisponible);
        acum.comp = acum.comp.plus(item.cantidadComprometida);
        porAlmacen.set(clave, acum);
        totalDisp = totalDisp.plus(item.cantidadDisponible);
        totalComp = totalComp.plus(item.cantidadComprometida);
      }

      return {
        skuId: sku.id.toString(),
        codigoParlante: sku.codigoParlante,
        nombre: sku.nombre ?? sku.producto.nombre,
        unidad: sku.unidad.codigo,
        stockMinimo: sku.stockMinimo ? sku.stockMinimo.toString() : null,
        stocks: [...porAlmacen.entries()].map(([almId, v]) => ({
          almacenId: almId,
          disponible: v.disp.toString(),
          comprometido: v.comp.toString(),
        })),
        totalDisponible: totalDisp.toString(),
        totalComprometido: totalComp.toString(),
      };
    });

    return {
      datos,
      total,
      pagina,
      porPagina,
      almacenes: almacenes.map((a) => ({
        id: a.id.toString(),
        codigo: a.codigo,
        nombre: a.nombre,
      })),
    };
  }
}
