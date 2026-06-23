import { Injectable, NotFoundException } from "@nestjs/common";
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

// ── Ledger de movimientos (listado + detalle) ──────────────────────────────

export interface OpcionesMovimientos {
  pagina: number;
  porPagina: number;
  skuId?: bigint;
  almacenId?: bigint;
  /** Tipo de movimiento (enum TipoMovimiento). Omitido = todos. */
  tipo?: string;
  /** Filtra desde esta fecha (inclusive). */
  desde?: Date;
  /** Filtra hasta esta fecha (inclusive). */
  hasta?: Date;
}

/** Fila del listado paginado del ledger. */
export interface MovimientoItem {
  id: string;
  fecha: string;
  tipo: string;
  signo: string;
  cantidad: string;
  skuId: string;
  skuCodigo: string;
  skuNombre: string;
  /** Nombre del almacen (o su codigo como respaldo). */
  almacen: string;
  costoUnitario: string;
  costoTotal: string;
  /** Referencia legible del documento origen. */
  documento: string;
}

export interface MovimientosRespuesta {
  datos: MovimientoItem[];
  total: number;
  pagina: number;
  porPagina: number;
}

/** Capa FIFO consumida por un movimiento de salida. */
export interface CapaConsumida {
  cantidad: string;
  costoUnitario: string;
}

/** Detalle completo de un movimiento del ledger. */
export interface DetalleMovimiento {
  id: string;
  fecha: string;
  tipo: string;
  signo: string;
  sku: { id: string; codigo: string; nombre: string };
  almacen: string;
  usuario: string;
  documento: { tipo: string; referencia: string };
  sunat: {
    periodo: string;
    cuo: string;
    numeroCorrelativo: string;
    tipoOperacionSunat: string;
    tipoDocumentoSunat: string;
    serieComprobante: string | null;
    numeroComprobante: string | null;
  };
  cantidad: string;
  costos: {
    unitario: string;
    total: string;
    unitarioUsd: string | null;
    totalUsd: string | null;
  };
  saldos: {
    cantidad: string;
    costoUnitario: string;
    costoTotal: string;
  };
  /** Capas FIFO consumidas (solo salidas). Vacio si no aplica. */
  capas: CapaConsumida[];
  /** Numeros de serie ligados al movimiento. Vacio si no aplica. */
  series: string[];
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

  /** Serie-numero del comprobante si son reales (los defaults son "0"). */
  private comprobanteLegible(serie: string, numero: string): string | null {
    return serie !== "0" && numero !== "0" ? `${serie}-${numero}` : null;
  }

  /**
   * Listado paginado del ledger de movimientos de stock. Resuelve codigo/nombre
   * de SKU y nombre de almacen con consultas batch (IN [...] y un Map), sin N+1.
   * Ordenado por fecha desc y secuencia desc (lo mas reciente primero).
   */
  async listarMovimientos(
    empresaId: bigint,
    opciones: OpcionesMovimientos,
  ): Promise<MovimientosRespuesta> {
    const { pagina, porPagina, skuId, almacenId, tipo, desde, hasta } = opciones;

    const where: Prisma.MovimientoStockWhereInput = {
      empresaId,
      ...(skuId ? { skuId } : {}),
      ...(almacenId ? { almacenId } : {}),
      ...(tipo ? { tipo: tipo as Prisma.EnumTipoMovimientoFilter["equals"] } : {}),
      ...(desde || hasta
        ? {
            fechaMovimiento: {
              ...(desde ? { gte: desde } : {}),
              ...(hasta ? { lte: hasta } : {}),
            },
          }
        : {}),
    };

    const [total, movimientos] = await this.prisma.$transaction([
      this.prisma.movimientoStock.count({ where }),
      this.prisma.movimientoStock.findMany({
        where,
        orderBy: [{ fechaMovimiento: "desc" }, { secuencia: "desc" }],
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
    ]);

    // Resolucion batch: un findMany de SKUs IN [...] y un Map de almacenes.
    const skuIds = [...new Set(movimientos.map((m) => m.skuId))];
    const skus = skuIds.length
      ? await this.prisma.sku.findMany({
          where: { id: { in: skuIds } },
          select: { id: true, codigoParlante: true, nombre: true, producto: { select: { nombre: true } } },
        })
      : [];
    const skuPorId = new Map(
      skus.map((s) => [
        s.id.toString(),
        { codigo: s.codigoParlante, nombre: s.nombre ?? s.producto.nombre },
      ]),
    );
    const almacenPorId = new Map(
      (await this.prisma.almacen.findMany({ where: { empresaId } })).map((a) => [
        a.id.toString(),
        a.nombre,
      ]),
    );

    return {
      datos: movimientos.map((m) => {
        const sku = skuPorId.get(m.skuId.toString());
        return {
          id: m.id.toString(),
          fecha: m.fechaMovimiento.toISOString(),
          tipo: m.tipo,
          signo: m.signo,
          cantidad: m.cantidad.toString(),
          skuId: m.skuId.toString(),
          skuCodigo: sku?.codigo ?? m.skuId.toString(),
          skuNombre: sku?.nombre ?? "—",
          almacen: almacenPorId.get(m.almacenId.toString()) ?? m.almacenId.toString(),
          costoUnitario: m.costoUnitario.toString(),
          costoTotal: m.costoTotal.toString(),
          documento: this.construirReferenciaKardex(m),
        };
      }),
      total,
      pagina,
      porPagina,
    };
  }

  /**
   * Detalle completo de un movimiento del ledger: cabecera, bloque SUNAT,
   * costos en S/ y USD, saldos, capas FIFO consumidas (solo salidas) y series.
   * Lanza NotFoundException si no existe o no pertenece a la empresa.
   */
  async detalleMovimiento(
    empresaId: bigint,
    id: bigint,
  ): Promise<DetalleMovimiento> {
    const m = await this.prisma.movimientoStock.findFirst({
      where: { id, empresaId },
      include: {
        sku: { select: { codigoParlante: true, nombre: true, producto: { select: { nombre: true } } } },
        usuario: { select: { nombre: true } },
        consumos: {
          orderBy: { id: "asc" },
          select: { cantidad: true, costoUnitario: true },
        },
        seriesEntrada: { select: { numeroSerie: true }, orderBy: { numeroSerie: "asc" } },
        seriesSalida: { select: { numeroSerie: true }, orderBy: { numeroSerie: "asc" } },
      },
    });

    if (!m) {
      throw new NotFoundException("El movimiento no existe.");
    }

    const almacen = await this.prisma.almacen.findUnique({
      where: { id: m.almacenId },
      select: { nombre: true },
    });

    // Las capas FIFO solo aplican a salidas; las series, segun el signo.
    const series =
      m.signo === "SALIDA"
        ? m.seriesSalida.map((s) => s.numeroSerie)
        : m.seriesEntrada.map((s) => s.numeroSerie);

    return {
      id: m.id.toString(),
      fecha: m.fechaMovimiento.toISOString(),
      tipo: m.tipo,
      signo: m.signo,
      sku: {
        id: m.skuId.toString(),
        codigo: m.sku.codigoParlante,
        nombre: m.sku.nombre ?? m.sku.producto.nombre,
      },
      almacen: almacen?.nombre ?? m.almacenId.toString(),
      usuario: m.usuario.nombre,
      documento: {
        tipo: m.documentoTipo,
        referencia: this.construirReferenciaKardex(m),
      },
      sunat: {
        periodo: m.periodo,
        cuo: m.cuo,
        numeroCorrelativo: m.numeroCorrelativo,
        tipoOperacionSunat: m.tipoOperacionSunat,
        tipoDocumentoSunat: m.tipoDocumentoSunat,
        serieComprobante: this.comprobanteLegible(m.serieComprobante, m.numeroComprobante)
          ? m.serieComprobante
          : null,
        numeroComprobante: this.comprobanteLegible(m.serieComprobante, m.numeroComprobante)
          ? m.numeroComprobante
          : null,
      },
      cantidad: m.cantidad.toString(),
      costos: {
        unitario: m.costoUnitario.toString(),
        total: m.costoTotal.toString(),
        unitarioUsd: m.costoUnitarioUsd?.toString() ?? null,
        totalUsd: m.costoTotalUsd?.toString() ?? null,
      },
      saldos: {
        cantidad: m.saldoCantidad.toString(),
        costoUnitario: m.saldoCostoUnitario.toString(),
        costoTotal: m.saldoCostoTotal.toString(),
      },
      capas: m.consumos.map((c) => ({
        cantidad: c.cantidad.toString(),
        costoUnitario: c.costoUnitario.toString(),
      })),
      series,
    };
  }
}
