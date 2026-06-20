import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../comun/prisma/prisma.service.js";

export interface LineaKardex {
  fecha: string;
  almacen: string;
  tipo: string;
  tipoOperacionSunat: string;
  /** Cantidad total del movimiento (sin signo). Se mantiene por compatibilidad. */
  cantidad: string;
  /** Cantidad de la columna ENTRADA: el monto si el movimiento es entrada, "0" si es salida. */
  cantidadEntrada: string;
  /** Cantidad de la columna SALIDA: el monto si el movimiento es salida, "0" si es entrada. */
  cantidadSalida: string;
  /** Descripcion legible del documento origen (como llego/salio). Ej "Compra F001-123", "Vale de salida N° 5". */
  referencia: string;
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
  cantidadDeteriorada: string;
  costoPromedio: string;
}

export interface StockEnAlmacen {
  almacenId: string;
  disponible: string;
  comprometido: string;
  /** Stock fisicamente presente pero NO disponible por estar deteriorado. */
  deteriorado: string;
  /** Costo promedio unitario del SKU en este almacen. */
  costoPromedio: string;
  /** Valor (costo) total del stock disponible en este almacen: disponible * costoPromedio. */
  valorTotal: string;
}

export interface ExistenciaSku {
  skuId: string;
  codigoParlante: string;
  nombre: string;
  unidad: string;
  stockMinimo: string | null;
  /** Renovabilidad: true = se repone/consume; false = no; null = sin clasificar. */
  esRenovable: boolean | null;
  stocks: StockEnAlmacen[];
  totalDisponible: string;
  totalComprometido: string;
  /** Total deteriorado del SKU sobre todos sus almacenes (no disponible). */
  totalDeteriorado: string;
  /**
   * Costo promedio ponderado del SKU sobre todos sus almacenes:
   * valorTotal / totalDisponible. "0" si no hay stock disponible.
   */
  costoPromedio: string;
  /** Valor (costo) total del SKU: suma de valorTotal de todos sus almacenes. */
  valorTotal: string;
}

export interface ExistenciasRespuesta {
  datos: ExistenciaSku[];
  total: number;
  pagina: number;
  porPagina: number;
  almacenes: AlmacenItem[];
  /** Valor (costo) total de todos los SKUs de la pagina actual. */
  valorizadoTotal: string;
}

export interface OpcionesExistencias {
  pagina: number;
  porPagina: number;
  busqueda?: string;
  almacenId?: bigint;
  /** Filtra por renovabilidad. Omitido = todos. */
  esRenovable?: boolean;
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

  /**
   * Construye la referencia legible del documento origen de un movimiento:
   * indica COMO llego o salio el stock combinando el tipo de documento con su
   * identificador (serie-numero del comprobante o el id del documento interno).
   */
  private construirReferenciaKardex(m: {
    documentoTipo: string;
    documentoId: bigint | null;
    serieComprobante: string;
    numeroComprobante: string;
  }): string {
    // Comprobante SUNAT con serie-numero reales (los defaults son "0").
    const tieneComprobante =
      m.serieComprobante !== "0" && m.numeroComprobante !== "0";
    const comprobante = tieneComprobante
      ? `${m.serieComprobante}-${m.numeroComprobante}`
      : null;
    const ref = m.documentoId !== null ? `N° ${m.documentoId.toString()}` : "";

    switch (m.documentoTipo) {
      case "ORDEN_COMPRA":
        return comprobante ? `Compra ${comprobante}` : `Orden de compra ${ref}`.trim();
      case "RECEPCION":
        return comprobante ? `Recepción ${comprobante}` : `Recepción ${ref}`.trim();
      case "VENTA":
        return comprobante ? `Venta ${comprobante}` : `Venta ${ref}`.trim();
      case "DEVOLUCION_VENTA":
        return comprobante
          ? `Devolución de venta ${comprobante}`
          : `Devolución de venta ${ref}`.trim();
      case "VALE_SALIDA":
        return `Vale de salida ${ref}`.trim();
      case "TRANSFERENCIA":
        return `Traslado ${ref}`.trim();
      case "AJUSTE":
        return `Ajuste ${ref}`.trim();
      case "CONTEO_FISICO":
        return `Conteo físico ${ref}`.trim();
      case "INICIAL":
        return "Saldo inicial";
      default:
        return comprobante ?? m.documentoTipo;
    }
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
      cantidadEntrada: m.signo === "ENTRADA" ? m.cantidad.toString() : "0",
      cantidadSalida: m.signo === "SALIDA" ? m.cantidad.toString() : "0",
      referencia: this.construirReferenciaKardex(m),
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
      cantidadDeteriorada: i.cantidadDeteriorada.toString(),
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
    const { pagina, porPagina, busqueda, almacenId, esRenovable } = opciones;

    const termino = busqueda?.trim();
    const whereSku: Prisma.SkuWhereInput = {
      empresaId,
      activo: true,
      ...(esRenovable !== undefined ? { esRenovable } : {}),
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
              cantidadDeteriorada: true,
              costoPromedio: true,
            },
          },
        },
      }),
      this.prisma.almacen.findMany({ where: { empresaId }, orderBy: { codigo: "asc" } }),
    ]);

    let valorizadoTotal = new Prisma.Decimal(0);

    const datos: ExistenciaSku[] = skus.map((sku) => {
      // Una posicion (item_stock) puede repetirse por ubicacion/lote/serie:
      // se agregan por almacen para obtener el saldo del SKU en cada uno. El
      // valor se acumula por posicion (disponible * costoPromedio de esa fila)
      // y el costo promedio del almacen se deriva como valor / disponible.
      const porAlmacen = new Map<
        string,
        {
          disp: Prisma.Decimal;
          comp: Prisma.Decimal;
          det: Prisma.Decimal;
          valor: Prisma.Decimal;
        }
      >();
      let totalDisp = new Prisma.Decimal(0);
      let totalComp = new Prisma.Decimal(0);
      let totalDet = new Prisma.Decimal(0);
      let totalValor = new Prisma.Decimal(0);
      for (const item of sku.items) {
        const clave = item.almacenId.toString();
        const acum =
          porAlmacen.get(clave) ??
          {
            disp: new Prisma.Decimal(0),
            comp: new Prisma.Decimal(0),
            det: new Prisma.Decimal(0),
            valor: new Prisma.Decimal(0),
          };
        const valorItem = item.cantidadDisponible.mul(item.costoPromedio);
        acum.disp = acum.disp.plus(item.cantidadDisponible);
        acum.comp = acum.comp.plus(item.cantidadComprometida);
        acum.det = acum.det.plus(item.cantidadDeteriorada);
        acum.valor = acum.valor.plus(valorItem);
        porAlmacen.set(clave, acum);
        totalDisp = totalDisp.plus(item.cantidadDisponible);
        totalComp = totalComp.plus(item.cantidadComprometida);
        totalDet = totalDet.plus(item.cantidadDeteriorada);
        totalValor = totalValor.plus(valorItem);
      }

      valorizadoTotal = valorizadoTotal.plus(totalValor);

      const costoPromedioSku = totalDisp.isZero()
        ? new Prisma.Decimal(0)
        : totalValor.div(totalDisp);

      return {
        skuId: sku.id.toString(),
        codigoParlante: sku.codigoParlante,
        nombre: sku.nombre ?? sku.producto.nombre,
        unidad: sku.unidad.codigo,
        stockMinimo: sku.stockMinimo ? sku.stockMinimo.toString() : null,
        esRenovable: sku.esRenovable,
        stocks: [...porAlmacen.entries()].map(([almId, v]) => ({
          almacenId: almId,
          disponible: v.disp.toString(),
          comprometido: v.comp.toString(),
          deteriorado: v.det.toString(),
          costoPromedio: v.disp.isZero()
            ? "0"
            : v.valor.div(v.disp).toString(),
          valorTotal: v.valor.toString(),
        })),
        totalDisponible: totalDisp.toString(),
        totalComprometido: totalComp.toString(),
        totalDeteriorado: totalDet.toString(),
        costoPromedio: costoPromedioSku.toString(),
        valorTotal: totalValor.toString(),
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
      valorizadoTotal: valorizadoTotal.toString(),
    };
  }
}
