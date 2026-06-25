import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { SIGNO_MOVIMIENTO } from "@bm/tipos";
import { PrismaService } from "../../comun/prisma/prisma.service.js";

const D = Prisma.Decimal;

type MovimientoConSku = Prisma.MovimientoStockGetPayload<{
  include: { sku: { include: { producto: true; unidad: true } } };
}>;

@Injectable()
export class ReportesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Stock valorizado actual por SKU (proyeccion), PAGINADO. El total general y
   * el conteo se calculan sobre TODO el inventario (no solo la pagina visible).
   */
  async valorizacion(empresaId: bigint, pagina: number, porPagina: number) {
    const saltar = (pagina - 1) * porPagina;

    // Total general y conteo de TODO el inventario (agregacion en SQL).
    const resumen = await this.prisma.$queryRaw<
      Array<{ total: bigint; valor: string | null }>
    >`
      SELECT COUNT(*)::bigint AS total,
             COALESCE(SUM((cantidad_disponible + cantidad_comprometida) * costo_promedio), 0) AS valor
      FROM item_stock
      WHERE empresa_id = ${empresaId}
    `;
    const total = Number(resumen[0]?.total ?? 0n);
    const totalGeneral = new D(resumen[0]?.valor ?? "0").toFixed(2);

    // Solo la pagina solicitada.
    const items = await this.prisma.itemStock.findMany({
      where: { empresaId },
      include: { sku: { include: { producto: { include: { familia: true } } } } },
      orderBy: { id: "asc" },
      skip: saltar,
      take: porPagina,
    });

    const filas = items.map((i) => {
      const cantidad = new D(i.cantidadDisponible).add(new D(i.cantidadComprometida));
      const valor = cantidad.mul(new D(i.costoPromedio));
      return {
        skuId: i.skuId.toString(),
        codigoParlante: i.sku.codigoParlante,
        producto: i.sku.producto.nombre,
        familia: i.sku.producto.familia.nombre,
        cantidad: cantidad.toString(),
        costoPromedio: new D(i.costoPromedio).toString(),
        valor: valor.toFixed(2),
      };
    });

    return { filas, total, totalGeneral, pagina, porPagina };
  }

  /** Productos por debajo del stock minimo configurado. */
  async alertasStockMinimo(empresaId: bigint) {
    const items = await this.prisma.itemStock.findMany({
      where: { empresaId, sku: { stockMinimo: { not: null } } },
      include: { sku: { include: { producto: true } } },
    });
    return items
      .filter((i) => i.sku.stockMinimo !== null &&
        new D(i.cantidadDisponible).lessThan(new D(i.sku.stockMinimo)))
      .map((i) => ({
        skuId: i.skuId.toString(),
        producto: i.sku.producto.nombre,
        disponible: i.cantidadDisponible.toString(),
        stockMinimo: i.sku.stockMinimo!.toString(),
      }));
  }

  /**
   * Reposicion: SKUs cuyo stock disponible esta en o por debajo del punto de
   * reposicion (o del stock minimo si no hay punto configurado). Sugiere la
   * cantidad a pedir para volver al stock maximo (stockMaximo - disponible);
   * si no hay stock maximo, la sugerencia es null (no se puede calcular).
   */
  async reposicion(empresaId: bigint) {
    const items = await this.prisma.itemStock.findMany({
      where: {
        empresaId,
        OR: [
          { sku: { puntoReposicion: { not: null } } },
          { sku: { stockMinimo: { not: null } } },
        ],
      },
      include: { sku: { include: { producto: true, unidad: true } } },
    });

    const filas = items
      .map((i) => {
        const disponible = new D(i.cantidadDisponible);
        const punto = i.sku.puntoReposicion;
        const minimo = i.sku.stockMinimo;
        // Umbral efectivo: punto de reposicion si existe, si no el stock minimo.
        const umbral = punto ?? minimo;
        if (umbral === null) return null;
        if (disponible.greaterThan(new D(umbral))) return null;

        const maximo = i.sku.stockMaximo;
        const sugerido =
          maximo !== null
            ? D.max(new D(maximo).sub(disponible), new D(0))
            : null;

        return {
          skuId: i.skuId.toString(),
          codigoParlante: i.sku.codigoParlante,
          producto: i.sku.producto.nombre,
          unidad: i.sku.unidad.codigo,
          disponible: disponible.toFixed(8),
          stockMinimo: minimo !== null ? new D(minimo).toFixed(8) : null,
          stockMaximo: maximo !== null ? new D(maximo).toFixed(8) : null,
          puntoReposicion: punto !== null ? new D(punto).toFixed(8) : null,
          semanasReposicion: i.sku.semanasReposicion,
          sugeridoPedir: sugerido !== null ? sugerido.toFixed(8) : null,
        };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null)
      .sort((a, b) => a.codigoParlante.localeCompare(b.codigoParlante));

    return { filas, total: filas.length };
  }

  /**
   * Clasificacion ABC por valor de consumo. Suma el costo de las salidas
   * valorizadas (todos los tipos SALIDA_*, valorizadas con costoTotal del
   * ledger FIFO) por SKU en el rango [desde, hasta], ordena de mayor a menor
   * valor y asigna clase por participacion acumulada: A=<=80%, B=<=95%, C=resto.
   *
   * Es solo CALCULO. La persistencia la decide el llamador (ProductoService).
   */
  async clasificacionAbc(empresaId: bigint, desde: string, hasta: string) {
    const fechaDesde = new Date(`${desde}T00:00:00.000Z`);
    const fechaHasta = new Date(`${hasta}T23:59:59.999Z`);

    const movimientos = await this.prisma.movimientoStock.findMany({
      where: {
        empresaId,
        signo: "SALIDA",
        fechaEmisionDocumento: { gte: fechaDesde, lte: fechaHasta },
      },
      select: { skuId: true, costoTotal: true, cantidad: true },
    });

    interface Acumulado {
      skuId: bigint;
      valorConsumo: Prisma.Decimal;
      cantidadConsumo: Prisma.Decimal;
    }
    const porSku = new Map<bigint, Acumulado>();
    let valorTotal = new D(0);

    for (const mov of movimientos) {
      const acc =
        porSku.get(mov.skuId) ??
        ({
          skuId: mov.skuId,
          valorConsumo: new D(0),
          cantidadConsumo: new D(0),
        } satisfies Acumulado);
      acc.valorConsumo = acc.valorConsumo.add(mov.costoTotal);
      acc.cantidadConsumo = acc.cantidadConsumo.add(mov.cantidad);
      porSku.set(mov.skuId, acc);
      valorTotal = valorTotal.add(mov.costoTotal);
    }

    // Desempate determinista por skuId: ante igual valor de consumo, el orden
    // (y por ende la clase A/B/C en el borde 80%/95%) debe ser reproducible
    // entre corridas, porque la clasificacion se persiste por SKU.
    const ordenados = [...porSku.values()].sort(
      (a, b) =>
        b.valorConsumo.comparedTo(a.valorConsumo) ||
        (a.skuId < b.skuId ? -1 : a.skuId > b.skuId ? 1 : 0),
    );

    // Resolver nombres de SKU/producto para etiquetar el resultado.
    const skuIds = ordenados.map((o) => o.skuId);
    const skus = await this.prisma.sku.findMany({
      where: { id: { in: skuIds }, empresaId },
      include: { producto: true },
    });
    const skuPorId = new Map(skus.map((s) => [s.id, s]));

    const usarPorcentaje = valorTotal.greaterThan(new D(0));
    let acumulado = new D(0);

    const filas = ordenados.map((o) => {
      acumulado = acumulado.add(o.valorConsumo);
      const participacion = usarPorcentaje
        ? new D(o.valorConsumo).div(valorTotal).mul(100)
        : new D(0);
      const acumPorcentaje = usarPorcentaje
        ? acumulado.div(valorTotal).mul(100)
        : new D(0);
      const clase: "A" | "B" | "C" = acumPorcentaje.lessThanOrEqualTo(80)
        ? "A"
        : acumPorcentaje.lessThanOrEqualTo(95)
          ? "B"
          : "C";
      const sku = skuPorId.get(o.skuId);
      return {
        skuId: o.skuId.toString(),
        codigoParlante: sku?.codigoParlante ?? "",
        producto: sku?.producto.nombre ?? "",
        cantidadConsumo: o.cantidadConsumo.toFixed(8),
        valorConsumo: this.dinero(o.valorConsumo),
        participacion: participacion.toFixed(2),
        participacionAcumulada: acumPorcentaje.toFixed(2),
        clasificacion: clase,
      };
    });

    return {
      desde,
      hasta,
      valorTotal: this.dinero(valorTotal),
      filas,
    };
  }

  /**
   * Rentabilidad de ventas: precio de venta vs costo. Recorre las salidas por
   * venta (movimientos SALIDA_VENTA, documentoTipo VENTA) en el rango
   * [desde, hasta] y por cada una calcula:
   *   - venta  = precioUnitario de la linea de la orden (por SKU) x cantidad
   *   - costo  = costoTotal del movimiento (costeo FIFO/promedio congelado en el ledger)
   *   - margen = venta - costo
   * Agrupa por articulo (SKU) o por cliente y devuelve el margen y el % de margen
   * sobre la venta de cada grupo, mas el total general.
   *
   * El rango filtra por fechaEmisionDocumento. El precio vive en la
   * OrdenVentaLinea; se resuelve via comprobante (documentoId) -> orden -> linea
   * con el mismo SKU. Si una venta no puede emparejarse con una linea (dato
   * incompleto) se valoriza su venta en 0 y se contabiliza en sinPrecio.
   */
  async rentabilidad(
    empresaId: bigint,
    desde: string,
    hasta: string,
    agrupar: "articulo" | "cliente",
  ) {
    const fechaDesde = new Date(`${desde}T00:00:00.000Z`);
    const fechaHasta = new Date(`${hasta}T23:59:59.999Z`);

    const movimientos = await this.prisma.movimientoStock.findMany({
      where: {
        empresaId,
        tipo: "SALIDA_VENTA",
        documentoTipo: "VENTA",
        fechaEmisionDocumento: { gte: fechaDesde, lte: fechaHasta },
      },
      select: {
        skuId: true,
        documentoId: true,
        cantidad: true,
        costoTotal: true,
      },
    });

    // El documentoId de SALIDA_VENTA apunta al ComprobanteVenta. De ahi se
    // obtienen la orden (precio por linea) y el cliente (agrupacion).
    const comprobanteIds = [
      ...new Set(
        movimientos
          .map((m) => m.documentoId)
          .filter((id): id is bigint => id !== null),
      ),
    ];
    const comprobantes = await this.prisma.comprobanteVenta.findMany({
      where: { id: { in: comprobanteIds }, empresaId },
      include: {
        cliente: true,
        ordenVenta: { include: { lineas: true } },
      },
    });
    const comprobantePorId = new Map(comprobantes.map((c) => [c.id, c]));

    interface Acumulado {
      claveId: string | null;
      etiqueta: string;
      cantidad: Prisma.Decimal;
      venta: Prisma.Decimal;
      costo: Prisma.Decimal;
    }
    const grupos = new Map<string, Acumulado>();
    let ventaTotal = new D(0);
    let costoTotal = new D(0);
    let sinPrecio = 0;

    for (const mov of movimientos) {
      const comprobante = mov.documentoId
        ? comprobantePorId.get(mov.documentoId)
        : undefined;

      // Precio: linea de la orden con el mismo SKU. Si hay varias lineas con el
      // mismo SKU se toma la primera (el modelo no liga el movimiento a una
      // linea concreta).
      const linea = comprobante?.ordenVenta.lineas.find(
        (l) => l.skuId === mov.skuId,
      );
      const precioUnitario = linea ? new D(linea.precioUnitario) : null;
      if (precioUnitario === null) sinPrecio += 1;
      const venta = precioUnitario
        ? precioUnitario.mul(new D(mov.cantidad))
        : new D(0);
      const costo = new D(mov.costoTotal);

      let claveId: string | null;
      let etiqueta: string;
      if (agrupar === "articulo") {
        claveId = mov.skuId.toString();
        etiqueta = ""; // se resuelve abajo con el maestro de SKU
      } else {
        const cli = comprobante?.cliente;
        claveId = cli ? cli.id.toString() : null;
        etiqueta = cli ? cli.razonSocial : "Sin cliente";
      }

      const clave =
        agrupar === "articulo"
          ? `sku_${claveId}`
          : (claveId ?? "__sin_cliente");
      const acc =
        grupos.get(clave) ??
        ({
          claveId,
          etiqueta,
          cantidad: new D(0),
          venta: new D(0),
          costo: new D(0),
        } satisfies Acumulado);

      acc.cantidad = acc.cantidad.add(mov.cantidad);
      acc.venta = acc.venta.add(venta);
      acc.costo = acc.costo.add(costo);
      grupos.set(clave, acc);

      ventaTotal = ventaTotal.add(venta);
      costoTotal = costoTotal.add(costo);
    }

    // Etiquetas de articulo: codigo parlante + nombre del producto.
    if (agrupar === "articulo") {
      const skuIds = [...grupos.values()]
        .map((g) => (g.claveId ? BigInt(g.claveId) : null))
        .filter((id): id is bigint => id !== null);
      const skus = await this.prisma.sku.findMany({
        where: { id: { in: skuIds }, empresaId },
        include: { producto: true },
      });
      const skuPorId = new Map(skus.map((s) => [s.id, s]));
      for (const g of grupos.values()) {
        if (!g.claveId) continue;
        const sku = skuPorId.get(BigInt(g.claveId));
        g.etiqueta = sku
          ? `${sku.codigoParlante} - ${sku.producto.nombre}`
          : g.claveId;
      }
    }

    const filas = [...grupos.values()]
      .map((g) => {
        const margen = g.venta.sub(g.costo);
        const margenPorcentaje = g.venta.greaterThan(new D(0))
          ? margen.div(g.venta).mul(100)
          : null;
        return {
          claveId: g.claveId,
          etiqueta: g.etiqueta,
          cantidad: new D(g.cantidad).toFixed(8),
          venta: this.dinero(g.venta),
          costo: this.dinero(g.costo),
          margen: this.dinero(margen),
          margenPorcentaje:
            margenPorcentaje !== null ? margenPorcentaje.toFixed(2) : null,
        };
      })
      .sort((a, b) => new D(b.margen).comparedTo(new D(a.margen)));

    const margenTotal = ventaTotal.sub(costoTotal);
    const margenPorcentajeTotal = ventaTotal.greaterThan(new D(0))
      ? margenTotal.div(ventaTotal).mul(100)
      : null;

    return {
      desde,
      hasta,
      agrupar,
      ventaTotal: this.dinero(ventaTotal),
      costoTotal: this.dinero(costoTotal),
      margenTotal: this.dinero(margenTotal),
      margenPorcentajeTotal:
        margenPorcentajeTotal !== null
          ? margenPorcentajeTotal.toFixed(2)
          : null,
      sinPrecio,
      filas,
    };
  }

  /**
   * Genera el Registro de Inventario Permanente en UNIDADES FISICAS (Formato
   * 12.1) como texto plano PLE (campos separados por '|', pipe de cierre).
   */
  async generarPle121(empresaId: bigint, periodo: string): Promise<string> {
    const movimientos = await this.movimientosPeriodo(empresaId, periodo);
    const lineas = movimientos.map((m) => {
      const esEntrada = m.signo === SIGNO_MOVIMIENTO.ENTRADA;
      const campos = [
        `${periodo}00`, // 1 periodo AAAAMM00
        m.cuo, // 2 CUO
        m.numeroCorrelativo, // 3 correlativo
        this.fechaAAAAMMDD(m.fechaEmisionDocumento), // 4 fecha emision
        m.tipoDocumentoSunat, // 5 tipo doc (Tabla 10)
        m.serieComprobante, // 6 serie
        m.numeroComprobante, // 7 numero
        this.codigoExistencia(m.sku.codigoUnspsc, m.sku.codigoParlante), // 8
        m.sku.tipoExistencia, // 9 tipo existencia (Tabla 5)
        this.descripcion(m), // 10 descripcion
        m.sku.unidad.codigo, // 11 unidad (Tabla 6)
        m.tipoOperacionSunat, // 12 tipo operacion (Tabla 12)
        esEntrada ? this.num(m.cantidad) : "0.00", // 13 entrada cantidad
        esEntrada ? "0.00" : this.num(m.cantidad), // 14 salida cantidad
        this.num(m.saldoCantidad), // 15 saldo cantidad
        m.indicadorEstado, // 16 indicador estado
      ];
      return campos.join("|") + "|";
    });
    return lineas.join("\r\n");
  }

  /**
   * Genera el Registro de Inventario Permanente VALORIZADO (Formato 13.1) como
   * texto plano PLE. Incluye costo unitario y total en entradas, salidas y saldo.
   */
  async generarPle131(empresaId: bigint, periodo: string): Promise<string> {
    const movimientos = await this.movimientosPeriodo(empresaId, periodo);
    const lineas = movimientos.map((m) => {
      const esEntrada = m.signo === SIGNO_MOVIMIENTO.ENTRADA;
      const campos = [
        `${periodo}00`, // 1 periodo
        m.cuo, // 2 CUO
        m.numeroCorrelativo, // 3 correlativo
        this.fechaAAAAMMDD(m.fechaEmisionDocumento), // 4 fecha emision
        m.tipoDocumentoSunat, // 5 tipo doc
        m.serieComprobante, // 6 serie
        m.numeroComprobante, // 7 numero
        this.codigoExistencia(m.sku.codigoUnspsc, m.sku.codigoParlante), // 8
        m.sku.tipoExistencia, // 9 tipo existencia
        this.descripcion(m), // 10 descripcion
        m.sku.unidad.codigo, // 11 unidad
        m.sku.metodoValuacion, // 12 metodo valuacion (Tabla 14)
        m.tipoOperacionSunat, // 13 tipo operacion
        esEntrada ? this.num(m.cantidad) : "0.00", // 14 entrada cantidad
        esEntrada ? this.num(m.costoUnitario) : "0.00", // 15 entrada costo unit
        esEntrada ? this.dinero(m.costoTotal) : "0.00", // 16 entrada costo total
        esEntrada ? "0.00" : this.num(m.cantidad), // 17 salida cantidad
        esEntrada ? "0.00" : this.num(m.costoUnitario), // 18 salida costo unit
        esEntrada ? "0.00" : this.dinero(m.costoTotal), // 19 salida costo total
        this.num(m.saldoCantidad), // 20 saldo cantidad
        this.num(m.saldoCostoUnitario), // 21 saldo costo unit
        this.dinero(m.saldoCostoTotal), // 22 saldo costo total
        m.indicadorEstado, // 23 indicador estado
      ];
      return campos.join("|") + "|";
    });
    return lineas.join("\r\n");
  }

  /** Nombre de archivo PLE segun la nomenclatura SUNAT. */
  async nombreArchivoPle(empresaId: bigint, periodo: string, formato: "121" | "131"): Promise<string> {
    const empresa = await this.prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });
    const codigoLibro = formato === "121" ? "120100" : "130100";
    return `LE${empresa.ruc}${periodo}00${codigoLibro}001111.txt`;
  }

  // --- helpers ---

  private movimientosPeriodo(empresaId: bigint, periodo: string): Promise<MovimientoConSku[]> {
    return this.prisma.movimientoStock.findMany({
      where: { empresaId, periodo },
      include: { sku: { include: { producto: true, unidad: true } } },
      orderBy: [{ fechaMovimiento: "asc" }, { secuencia: "asc" }],
    });
  }

  private fechaAAAAMMDD(fecha: Date): string {
    const a = fecha.getFullYear().toString();
    const m = (fecha.getMonth() + 1).toString().padStart(2, "0");
    const d = fecha.getDate().toString().padStart(2, "0");
    return `${a}${m}${d}`;
  }

  private codigoExistencia(unspsc: string | null, parlante: string): string {
    if (unspsc && unspsc.length > 0) return unspsc;
    // Sin UNSPSC: usa el codigo parlante completado a 16 (placeholder hasta mapear OSCE).
    return parlante.padEnd(16, "0").slice(0, 16);
  }

  private descripcion(m: MovimientoConSku): string {
    const base = m.sku.nombre ?? m.sku.producto.nombre;
    return base.slice(0, 80);
  }

  private num(valor: Prisma.Decimal): string {
    return new D(valor).toFixed(2);
  }

  private dinero(valor: Prisma.Decimal): string {
    return new D(valor).toFixed(2);
  }

  /**
   * Consumo valorizado: salidas tipo SALIDA_CONSUMO (vales de salida) en el rango
   * [desde, hasta], valorizadas con el costo FIFO ya congelado en el ledger
   * (costoTotal) y agrupadas por centro de costo, solicitante u orden de trabajo.
   *
   * El rango filtra por fechaEmisionDocumento (fecha contable del documento).
   * El eje de agrupacion se obtiene del vale de salida vinculado (documentoId),
   * no del movimiento, porque centro/solicitante/OT viven en el vale.
   */
  async consumoValorizado(
    empresaId: bigint,
    desde: string,
    hasta: string,
    agrupar: "centroCosto" | "solicitante" | "ordenTrabajo",
  ) {
    const fechaDesde = new Date(`${desde}T00:00:00.000Z`);
    const fechaHasta = new Date(`${hasta}T23:59:59.999Z`);

    const movimientos = await this.prisma.movimientoStock.findMany({
      where: {
        empresaId,
        tipo: "SALIDA_CONSUMO",
        documentoTipo: "VALE_SALIDA",
        fechaEmisionDocumento: { gte: fechaDesde, lte: fechaHasta },
      },
      select: {
        documentoId: true,
        cantidad: true,
        costoTotal: true,
        costoTotalUsd: true,
      },
    });

    // Vales referenciados, para resolver el eje de agrupacion.
    const valeIds = [
      ...new Set(
        movimientos
          .map((m) => m.documentoId)
          .filter((id): id is bigint => id !== null),
      ),
    ];
    const vales = await this.prisma.valeSalida.findMany({
      where: { id: { in: valeIds }, empresaId },
      include: { centroCosto: true, solicitante: true, ordenTrabajo: true },
    });
    const valePorId = new Map(vales.map((v) => [v.id, v]));

    interface Acumulado {
      claveId: string | null;
      etiqueta: string;
      cantidad: Prisma.Decimal;
      costoTotal: Prisma.Decimal;
      costoTotalUsd: Prisma.Decimal;
      hayUsd: boolean;
    }
    const grupos = new Map<string, Acumulado>();
    let totalSoles = new D(0);

    for (const mov of movimientos) {
      const vale = mov.documentoId ? valePorId.get(mov.documentoId) : undefined;

      let claveId: string | null;
      let etiqueta: string;
      if (agrupar === "centroCosto") {
        claveId = vale ? vale.centroCostoId.toString() : null;
        etiqueta = vale ? vale.centroCosto.nombre : "Sin centro de costo";
      } else if (agrupar === "solicitante") {
        claveId = vale ? vale.solicitanteId.toString() : null;
        etiqueta = vale ? vale.solicitante.nombre : "Sin solicitante";
      } else {
        claveId = vale?.ordenTrabajoId ? vale.ordenTrabajoId.toString() : null;
        etiqueta = vale?.ordenTrabajo
          ? `${vale.ordenTrabajo.numero} - ${vale.ordenTrabajo.descripcion}`
          : "Sin orden de trabajo";
      }

      const clave = claveId ?? `__${etiqueta}`;
      const acc =
        grupos.get(clave) ??
        ({
          claveId,
          etiqueta,
          cantidad: new D(0),
          costoTotal: new D(0),
          costoTotalUsd: new D(0),
          hayUsd: false,
        } satisfies Acumulado);

      acc.cantidad = acc.cantidad.add(mov.cantidad);
      acc.costoTotal = acc.costoTotal.add(mov.costoTotal);
      if (mov.costoTotalUsd !== null) {
        acc.costoTotalUsd = acc.costoTotalUsd.add(mov.costoTotalUsd);
        acc.hayUsd = true;
      }
      grupos.set(clave, acc);
      totalSoles = totalSoles.add(mov.costoTotal);
    }

    const filas = [...grupos.values()]
      .map((g) => ({
        claveId: g.claveId,
        etiqueta: g.etiqueta,
        cantidad: new D(g.cantidad).toFixed(8),
        costoTotalSoles: this.dinero(g.costoTotal),
        costoTotalUsd: g.hayUsd ? this.dinero(g.costoTotalUsd) : null,
      }))
      .sort((a, b) => new D(b.costoTotalSoles).comparedTo(new D(a.costoTotalSoles)));

    return {
      desde,
      hasta,
      agrupar,
      totalSoles: this.dinero(totalSoles),
      grupos: filas,
    };
  }
}
