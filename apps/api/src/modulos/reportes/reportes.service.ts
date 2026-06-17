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
}
