import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../comun/prisma/prisma.service.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { AuditoriaService } from "../auditoria/auditoria.service.js";

const D = Prisma.Decimal;

/** Saldo valorizado de cierre por SKU/almacen, calculado desde el ledger. */
interface SaldoCierre {
  sku_id: bigint;
  almacen_id: bigint;
  cantidad: string;
  costo_soles: string;
  costo_usd: string | null;
}

@Injectable()
export class CierresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Lista los periodos con su estado y totales valorizados, mas recientes primero. */
  async listar(empresaId: bigint) {
    const cierres = await this.prisma.cierrePeriodo.findMany({
      where: { empresaId },
      orderBy: { periodo: "desc" },
      include: { cerradoPor: { select: { id: true, nombre: true } } },
    });
    return cierres.map((c) => ({
      id: c.id.toString(),
      periodo: c.periodo,
      estado: c.estado,
      cerradoPor: c.cerradoPor
        ? { id: c.cerradoPor.id.toString(), nombre: c.cerradoPor.nombre }
        : null,
      fechaCierre: c.fechaCierre?.toISOString() ?? null,
      totalValorizadoSoles: c.totalValorizadoSoles.toFixed(2),
      totalValorizadoUsd: c.totalValorizadoUsd?.toFixed(2) ?? null,
    }));
  }

  /**
   * Cierra un periodo: congela el saldo valorizado por SKU/almacen al fin del
   * periodo (ultimo movimiento del ledger con periodo <= objetivo) y bloquea
   * el registro de nuevos movimientos con fecha dentro de ese periodo.
   */
  async cerrar(usuario: UsuarioRequest, periodo: string) {
    this.validarPeriodo(periodo);

    return this.prisma.$transaction(async (tx) => {
      const existente = await tx.cierrePeriodo.findUnique({
        where: { empresaId_periodo: { empresaId: usuario.empresaId, periodo } },
      });
      if (existente?.estado === "CERRADO") {
        throw new ConflictException(`El periodo ${periodo} ya esta cerrado.`);
      }

      // Cierre secuencial: no se puede cerrar un periodo si hay periodos
      // anteriores con movimientos que sigan abiertos (sin cerrar). El saldo de
      // cierre es un saldo corrido; cerrar fuera de orden lo dejaria inconsistente.
      // Se valida contra el ledger: si existe algun movimiento de un periodo previo
      // y ese periodo no esta CERRADO, se bloquea.
      const periodosPreviosConMovimiento = await tx.$queryRaw<{ periodo: string }[]>`
        SELECT DISTINCT periodo
        FROM movimiento_stock
        WHERE empresa_id = ${usuario.empresaId}
          AND periodo < ${periodo}
      `;
      const cerrados = await tx.cierrePeriodo.findMany({
        where: {
          empresaId: usuario.empresaId,
          estado: "CERRADO",
          periodo: { lt: periodo },
        },
        select: { periodo: true },
      });
      const setCerrados = new Set(cerrados.map((c) => c.periodo));
      const previosAbiertos = periodosPreviosConMovimiento
        .map((p) => p.periodo)
        .filter((p) => !setCerrados.has(p))
        .sort();
      if (previosAbiertos.length > 0) {
        throw new ConflictException(
          `No se puede cerrar el periodo ${periodo}: existen periodos anteriores ` +
            `con movimientos sin cerrar (${previosAbiertos.join(", ")}). ` +
            `Cierra primero el periodo mas antiguo.`,
        );
      }

      // Saldo de cierre por SKU/almacen: ultimo movimiento (mayor secuencia)
      // cuyo periodo <= objetivo. saldoCantidad y saldoCostoTotal son el saldo
      // corrido que SUNAT exige guardar en cada movimiento. El USD se deriva del
      // ratio USD/soles del propio movimiento (el ledger no guarda saldo USD).
      const saldos = await tx.$queryRaw<SaldoCierre[]>`
        SELECT DISTINCT ON (sku_id, almacen_id)
          sku_id,
          almacen_id,
          saldo_cantidad AS cantidad,
          saldo_costo_total AS costo_soles,
          CASE
            WHEN costo_total IS NULL OR costo_total = 0 OR costo_total_usd IS NULL
              THEN NULL
            ELSE ROUND(saldo_costo_total * costo_total_usd / costo_total, 2)
          END AS costo_usd
        FROM movimiento_stock
        WHERE empresa_id = ${usuario.empresaId}
          AND periodo <= ${periodo}
        ORDER BY sku_id, almacen_id, secuencia DESC
      `;

      // Solo se congelan posiciones con saldo distinto de cero.
      const conSaldo = saldos.filter((s) => !new D(s.cantidad).isZero());

      let totalSoles = new D(0);
      let totalUsd: Prisma.Decimal | null = new D(0);
      for (const s of conSaldo) {
        totalSoles = totalSoles.add(new D(s.costo_soles));
        if (s.costo_usd === null) {
          totalUsd = null; // un saldo sin USD invalida el total USD del periodo.
        } else if (totalUsd !== null) {
          totalUsd = totalUsd.add(new D(s.costo_usd));
        }
      }

      const cierre = await tx.cierrePeriodo.upsert({
        where: { empresaId_periodo: { empresaId: usuario.empresaId, periodo } },
        update: {
          estado: "CERRADO",
          cerradoPorId: usuario.id,
          fechaCierre: new Date(),
          totalValorizadoSoles: totalSoles,
          totalValorizadoUsd: totalUsd,
        },
        create: {
          empresaId: usuario.empresaId,
          periodo,
          estado: "CERRADO",
          cerradoPorId: usuario.id,
          fechaCierre: new Date(),
          totalValorizadoSoles: totalSoles,
          totalValorizadoUsd: totalUsd,
        },
      });

      // Snapshot inmutable: se reemplaza cualquier remanente previo y se reinserta.
      await tx.saldoPeriodo.deleteMany({ where: { cierreId: cierre.id } });
      if (conSaldo.length > 0) {
        await tx.saldoPeriodo.createMany({
          data: conSaldo.map((s) => ({
            empresaId: usuario.empresaId,
            cierreId: cierre.id,
            periodo,
            skuId: s.sku_id,
            almacenId: s.almacen_id,
            cantidad: new D(s.cantidad),
            costoSoles: new D(s.costo_soles),
            costoUsd: s.costo_usd === null ? null : new D(s.costo_usd),
          })),
        });
      }

      await this.auditoria.registrar(
        {
          empresaId: usuario.empresaId,
          usuarioId: usuario.id,
          accion: "CERRAR_PERIODO",
          entidad: "CIERRE_PERIODO",
          entidadId: cierre.id,
          detalle: `Periodo ${periodo} cerrado (${conSaldo.length} posiciones congeladas)`,
        },
        tx,
      );

      return {
        id: cierre.id.toString(),
        periodo: cierre.periodo,
        estado: cierre.estado,
        totalValorizadoSoles: cierre.totalValorizadoSoles.toFixed(2),
        totalValorizadoUsd: cierre.totalValorizadoUsd?.toFixed(2) ?? null,
        skusCongelados: conSaldo.length,
      };
    });
  }

  /** Reabre un periodo cerrado (solo ADMIN). Conserva el snapshot historico. */
  async reabrir(usuario: UsuarioRequest, periodo: string) {
    this.validarPeriodo(periodo);
    const cierre = await this.prisma.cierrePeriodo.findUnique({
      where: { empresaId_periodo: { empresaId: usuario.empresaId, periodo } },
    });
    if (!cierre) throw new NotFoundException(`No existe cierre para el periodo ${periodo}.`);
    if (cierre.estado === "ABIERTO") {
      throw new ConflictException(`El periodo ${periodo} ya esta abierto.`);
    }
    await this.prisma.cierrePeriodo.update({
      where: { id: cierre.id },
      data: { estado: "ABIERTO", cerradoPorId: null, fechaCierre: null },
    });
    await this.auditoria.registrar({
      empresaId: usuario.empresaId,
      usuarioId: usuario.id,
      accion: "REABRIR_PERIODO",
      entidad: "CIERRE_PERIODO",
      entidadId: cierre.id,
      detalle: `Periodo ${periodo} reabierto`,
    });
    return { id: cierre.id.toString(), periodo, estado: "ABIERTO" as const };
  }

  private validarPeriodo(periodo: string): void {
    if (!/^\d{6}$/.test(periodo)) {
      throw new BadRequestException("El periodo debe tener formato AAAAMM.");
    }
    const mes = Number(periodo.slice(4, 6));
    if (mes < 1 || mes > 12) {
      throw new BadRequestException("El mes del periodo debe estar entre 01 y 12.");
    }
  }
}
