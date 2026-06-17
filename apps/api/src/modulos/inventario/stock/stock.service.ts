import { Injectable } from "@nestjs/common";
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
}
