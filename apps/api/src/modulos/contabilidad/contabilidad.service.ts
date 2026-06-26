import { BadRequestException, Injectable } from "@nestjs/common";
import { ConceptoContable, Prisma, TipoMovimiento } from "@prisma/client";
import { PrismaService } from "../../comun/prisma/prisma.service.js";

const D = Prisma.Decimal;

/// Tipo de asiento solicitado por el endpoint de generacion. Cada uno se mapea
/// a un concepto contable configurable y a los tipos de movimiento que valoriza.
export type TipoAsiento = "COSTO_VENTA" | "CONSUMO" | "COMPRA" | "DEVOLUCION";

/// Fuente unica de verdad del mapeo asiento -> concepto contable + tipos de
/// movimiento del ledger que lo alimentan + prefijo de glosa. Las CUENTAS (debe/
/// haber) NO se deciden aqui: las define BM por concepto en CuentaContableConfig;
/// aqui solo se conecta cada concepto con su(s) tipo(s) de movimiento (mapeo
/// factual, no politica contable). Mermas/bajas por desmedro quedan fuera a
/// proposito: su tratamiento tributario lo debe definir el contador de BM.
const MAPEO_ASIENTO: Record<
  TipoAsiento,
  { concepto: ConceptoContable; tipos: TipoMovimiento[]; glosa: string }
> = {
  COSTO_VENTA: {
    concepto: ConceptoContable.COSTO_VENTA,
    // La anulacion de devolucion es el reverso de una devolucion: el stock
    // vuelve a salir, su costo re-debita el costo de venta. Sin incluirla, ese
    // costo nunca llegaria al asiento y el costo de venta quedaria subvaluado.
    tipos: [TipoMovimiento.SALIDA_VENTA, TipoMovimiento.SALIDA_ANULACION_DEVOLUCION],
    glosa: "Costo de venta",
  },
  CONSUMO: {
    concepto: ConceptoContable.CONSUMO,
    tipos: [TipoMovimiento.SALIDA_CONSUMO],
    glosa: "Consumo",
  },
  COMPRA: {
    concepto: ConceptoContable.COMPRA,
    tipos: [TipoMovimiento.ENTRADA_COMPRA],
    glosa: "Compra",
  },
  DEVOLUCION: {
    concepto: ConceptoContable.DEVOLUCION,
    tipos: [TipoMovimiento.ENTRADA_DEVOLUCION],
    glosa: "Devolucion de venta",
  },
};

/// Una linea de asiento lista para exportar (estilo CONCAR).
interface LineaAsiento {
  fecha: string; // AAAA-MM-DD (fecha de emision del documento)
  cuentaDebe: string;
  cuentaHaber: string;
  importe: string; // costo valorizado del movimiento, 2 decimales
  glosa: string;
  centroCosto: string | null; // codigo del centro de costo, si aplica
}

@Injectable()
export class ContabilidadService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Configuracion de cuentas ---

  /// Devuelve la configuracion de cuentas de la empresa, una fila por concepto.
  async listarCuentas(empresaId: bigint) {
    const cuentas = await this.prisma.cuentaContableConfig.findMany({
      where: { empresaId },
      orderBy: { concepto: "asc" },
    });
    return cuentas.map((c) => ({
      concepto: c.concepto,
      cuentaDebe: c.cuentaDebe,
      cuentaHaber: c.cuentaHaber,
    }));
  }

  /// Reemplaza (upsert) la configuracion de cuentas. Las cuentas las define BM;
  /// no hay valores por defecto en el codigo.
  async guardarCuentas(
    empresaId: bigint,
    cuentas: ReadonlyArray<{
      concepto: ConceptoContable;
      cuentaDebe: string;
      cuentaHaber: string;
    }>,
  ) {
    const conceptos = new Set<ConceptoContable>();
    for (const c of cuentas) {
      if (conceptos.has(c.concepto)) {
        throw new BadRequestException(
          `El concepto ${c.concepto} está repetido en la configuración.`,
        );
      }
      conceptos.add(c.concepto);
    }

    await this.prisma.$transaction(
      cuentas.map((c) =>
        this.prisma.cuentaContableConfig.upsert({
          where: { empresaId_concepto: { empresaId, concepto: c.concepto } },
          update: { cuentaDebe: c.cuentaDebe, cuentaHaber: c.cuentaHaber },
          create: {
            empresaId,
            concepto: c.concepto,
            cuentaDebe: c.cuentaDebe,
            cuentaHaber: c.cuentaHaber,
          },
        }),
      ),
    );

    return this.listarCuentas(empresaId);
  }

  // --- Generacion de asientos ---

  /// Genera las lineas de asiento del periodo a partir de los movimientos
  /// valorizados del ledger, usando la cuenta configurada para el concepto.
  /// Una linea por movimiento, valorizada con el costoTotal congelado en el
  /// ledger (costeo FIFO/promedio). El centro de costo se resuelve del vale de
  /// salida en el caso de CONSUMO; en COSTO_VENTA no aplica (queda null).
  async generarAsientos(
    empresaId: bigint,
    periodo: string,
    tipo: TipoAsiento,
  ): Promise<{
    periodo: string;
    tipo: TipoAsiento;
    concepto: ConceptoContable;
    cuentaDebe: string;
    cuentaHaber: string;
    totalImporte: string;
    lineas: LineaAsiento[];
  }> {
    const mapeo = MAPEO_ASIENTO[tipo];
    const concepto = mapeo.concepto;

    const config = await this.prisma.cuentaContableConfig.findUnique({
      where: { empresaId_concepto: { empresaId, concepto } },
    });
    if (!config) {
      throw new BadRequestException(
        `No hay cuentas configuradas para el concepto ${concepto}. ` +
          `Configúralas en Contabilidad antes de generar asientos.`,
      );
    }

    const movimientos = await this.prisma.movimientoStock.findMany({
      where: { empresaId, periodo, tipo: { in: mapeo.tipos } },
      include: { sku: { include: { producto: true } } },
      orderBy: [{ fechaEmisionDocumento: "asc" }, { secuencia: "asc" }],
    });

    // Para CONSUMO el centro de costo vive en el vale de salida (documentoId).
    const valePorId =
      tipo === "CONSUMO"
        ? await this.resolverVales(empresaId, movimientos)
        : new Map<bigint, { centroCostoCodigo: string }>();

    let total = new D(0);
    const lineas: LineaAsiento[] = movimientos.map((m) => {
      const importe = new D(m.costoTotal);
      total = total.add(importe);

      const skuNombre = m.sku.nombre ?? m.sku.producto.nombre;
      const centroCosto =
        tipo === "CONSUMO" && m.documentoId
          ? (valePorId.get(m.documentoId)?.centroCostoCodigo ?? null)
          : null;

      const glosa = `${mapeo.glosa} ${m.sku.codigoParlante} - ${skuNombre}`;

      return {
        fecha: this.fechaIso(m.fechaEmisionDocumento),
        cuentaDebe: config.cuentaDebe,
        cuentaHaber: config.cuentaHaber,
        importe: importe.toFixed(2),
        glosa,
        centroCosto,
      } satisfies LineaAsiento;
    });

    return {
      periodo,
      tipo,
      concepto,
      cuentaDebe: config.cuentaDebe,
      cuentaHaber: config.cuentaHaber,
      totalImporte: total.toFixed(2),
      lineas,
    };
  }

  /// Serializa las lineas a texto plano con el separador pedido (pipe o coma),
  /// una linea por fila, terminada en salto de linea CRLF (estilo CONCAR/PLE).
  serializarTexto(
    lineas: ReadonlyArray<LineaAsiento>,
    separador: "|" | ",",
  ): string {
    return lineas
      .map((l) =>
        [
          l.fecha,
          // Todo campo de texto que provenga de configuracion libre (cuentas,
          // centro de costo, glosa) se limpia del separador: si una cuenta o un
          // centro de costo contuviera el caracter, correria las columnas y la
          // importacion CONCAR/PLE fallaria. El separador debe ser inviolable.
          this.limpiar(l.cuentaDebe, separador),
          this.limpiar(l.cuentaHaber, separador),
          l.importe,
          this.limpiar(l.glosa, separador),
          l.centroCosto ? this.limpiar(l.centroCosto, separador) : "",
        ].join(separador),
      )
      .join("\r\n");
  }

  // --- helpers ---

  private async resolverVales(
    empresaId: bigint,
    movimientos: ReadonlyArray<{ documentoId: bigint | null }>,
  ): Promise<Map<bigint, { centroCostoCodigo: string }>> {
    const valeIds = [
      ...new Set(
        movimientos
          .map((m) => m.documentoId)
          .filter((id): id is bigint => id !== null),
      ),
    ];
    if (valeIds.length === 0) return new Map();

    const vales = await this.prisma.valeSalida.findMany({
      where: { id: { in: valeIds }, empresaId },
      include: { centroCosto: true },
    });
    return new Map(
      vales.map((v) => [v.id, { centroCostoCodigo: v.centroCosto.codigo }]),
    );
  }

  private fechaIso(fecha: Date): string {
    const a = fecha.getUTCFullYear().toString();
    const m = (fecha.getUTCMonth() + 1).toString().padStart(2, "0");
    const d = fecha.getUTCDate().toString().padStart(2, "0");
    return `${a}-${m}-${d}`;
  }

  /// Evita que el separador rompa la glosa en el texto plano.
  private limpiar(texto: string, separador: "|" | ","): string {
    return texto.split(separador).join(" ");
  }
}
