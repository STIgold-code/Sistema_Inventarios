import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../comun/prisma/prisma.service.js";

type Tx = Prisma.TransactionClient;
const D = Prisma.Decimal;

export interface TipoCambioVista {
  id: string;
  fecha: string; // YYYY-MM-DD
  compra: string;
  venta: string;
}

/**
 * Tipo de cambio diario (PEN/USD) por empresa. La fecha se almacena como `Date`
 * (sin hora) normalizada a medianoche UTC para que la unicidad por dia sea
 * estable independientemente del huso horario del cliente.
 */
@Injectable()
export class TiposCambioService {
  constructor(private readonly prisma: PrismaService) {}

  /** Normaliza un "YYYY-MM-DD" a medianoche UTC (clave estable por dia). */
  static fechaUtc(iso: string): Date {
    const fecha = new Date(`${iso}T00:00:00.000Z`);
    if (Number.isNaN(fecha.getTime())) {
      throw new BadRequestException("Fecha invalida.");
    }
    return fecha;
  }

  /** Formatea una fecha a "YYYY-MM-DD" en UTC. */
  private static aIso(fecha: Date): string {
    return fecha.toISOString().slice(0, 10);
  }

  /** Lista los tipos de cambio de un mes (anio/mes), ordenados por fecha. */
  async listarMes(empresaId: bigint, anio: number, mes: number): Promise<TipoCambioVista[]> {
    if (!Number.isInteger(anio) || !Number.isInteger(mes) || mes < 1 || mes > 12) {
      throw new BadRequestException("Anio o mes invalidos.");
    }
    const desde = new Date(Date.UTC(anio, mes - 1, 1));
    const hasta = new Date(Date.UTC(anio, mes, 1)); // primer dia del mes siguiente

    const filas = await this.prisma.tipoCambioDiario.findMany({
      where: { empresaId, fecha: { gte: desde, lt: hasta } },
      orderBy: { fecha: "asc" },
    });

    return filas.map((f) => ({
      id: f.id.toString(),
      fecha: TiposCambioService.aIso(f.fecha),
      compra: f.compra.toString(),
      venta: f.venta.toString(),
    }));
  }

  /** Upsert del tipo de cambio de una fecha. */
  async guardar(
    empresaId: bigint,
    dto: { fecha: string; compra: string; venta: string },
  ): Promise<TipoCambioVista> {
    const fecha = TiposCambioService.fechaUtc(dto.fecha);
    const compra = new D(dto.compra);
    const venta = new D(dto.venta);
    if (compra.lessThanOrEqualTo(0) || venta.lessThanOrEqualTo(0)) {
      throw new BadRequestException("El tipo de cambio debe ser mayor a cero.");
    }

    const fila = await this.prisma.tipoCambioDiario.upsert({
      where: { empresaId_fecha: { empresaId, fecha } },
      create: { empresaId, fecha, compra, venta },
      update: { compra, venta },
    });

    return {
      id: fila.id.toString(),
      fecha: TiposCambioService.aIso(fila.fecha),
      compra: fila.compra.toString(),
      venta: fila.venta.toString(),
    };
  }

  /**
   * Tipo de cambio de una fecha dada, usando un cliente transaccional.
   * Devuelve null si no hay TC cargado para ese dia. Usado por el motor de
   * movimientos para la valuacion bimoneda sin romper si falta el dato.
   */
  async obtenerPorFecha(
    tx: Tx,
    empresaId: bigint,
    fecha: Date,
  ): Promise<Prisma.TipoCambioDiarioGetPayload<Record<string, never>> | null> {
    const dia = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
    return tx.tipoCambioDiario.findUnique({
      where: { empresaId_fecha: { empresaId, fecha: dia } },
    });
  }
}
