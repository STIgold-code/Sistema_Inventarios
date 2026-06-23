import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { SIGNO_MOVIMIENTO } from "@bm/tipos";
import { PrismaService } from "../../comun/prisma/prisma.service.js";

const D = Prisma.Decimal;

/** Fila de top reposicion devuelta por el dashboard. */
interface FilaReposicion {
  skuId: string;
  codigoParlante: string;
  producto: string;
  disponible: string;
  stockMinimo: string;
  sugerido: string;
}

/** Respuesta agregada del dashboard. Shape estable consumido por el frontend. */
export interface DashboardResumen {
  inventario: {
    valorTotal: string;
    valorDeteriorado: string;
    skusActivos: number;
    posicionesConStock: number;
    skusSinStock: number;
  };
  reposicion: {
    bajoMinimo: number;
    items: FilaReposicion[];
  };
  pendientes: {
    requerimientosPorAprobar: number;
    ocPorRecibir: number;
    ventasPorDespachar: number;
  };
  periodo: {
    actual: string;
    estado: "ABIERTO" | "CERRADO";
    movimientosEntrada: number;
    movimientosSalida: number;
  };
  actividad: Array<{
    accion: string;
    entidad: string;
    detalle: string | null;
    creadoEn: string;
    usuario: string;
  }>;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Agrega en una sola respuesta el estado operativo de la empresa: valor de
   * inventario, alertas de reposicion, pendientes de gestion, estado del
   * periodo actual y actividad reciente. Todo scoped por empresaId y resuelto
   * con agregaciones en SQL (counts/sums), sin cargar colecciones a memoria.
   */
  async resumen(empresaId: bigint): Promise<DashboardResumen> {
    const periodoActual = this.periodoActual(new Date());

    const [
      inventario,
      bajoMinimoFilas,
      requerimientosPorAprobar,
      ocPorRecibir,
      ventasPorDespachar,
      cierre,
      movimientosEntrada,
      movimientosSalida,
      actividad,
    ] = await Promise.all([
      this.inventario(empresaId),
      this.topReposicion(empresaId),
      this.prisma.requerimientoCompra.count({
        where: { empresaId, estado: "BORRADOR" },
      }),
      this.prisma.ordenCompra.count({
        where: { empresaId, estado: { in: ["EMITIDA", "PARCIAL"] } },
      }),
      this.prisma.ordenVenta.count({
        where: { empresaId, estado: { in: ["PENDIENTE", "PARCIAL"] } },
      }),
      this.prisma.cierrePeriodo.findUnique({
        where: { empresaId_periodo: { empresaId, periodo: periodoActual } },
        select: { estado: true },
      }),
      this.prisma.movimientoStock.count({
        where: {
          empresaId,
          periodo: periodoActual,
          signo: SIGNO_MOVIMIENTO.ENTRADA,
        },
      }),
      this.prisma.movimientoStock.count({
        where: {
          empresaId,
          periodo: periodoActual,
          signo: SIGNO_MOVIMIENTO.SALIDA,
        },
      }),
      this.prisma.registroAuditoria.findMany({
        where: { empresaId },
        orderBy: { creadoEn: "desc" },
        take: 8,
        select: {
          accion: true,
          entidad: true,
          detalle: true,
          creadoEn: true,
          usuario: { select: { nombre: true } },
        },
      }),
    ]);

    return {
      inventario,
      reposicion: {
        bajoMinimo: bajoMinimoFilas.total,
        items: bajoMinimoFilas.items,
      },
      pendientes: {
        requerimientosPorAprobar,
        ocPorRecibir,
        ventasPorDespachar,
      },
      periodo: {
        actual: periodoActual,
        estado: cierre?.estado === "CERRADO" ? "CERRADO" : "ABIERTO",
        movimientosEntrada,
        movimientosSalida,
      },
      actividad: actividad.map((a) => ({
        accion: a.accion,
        entidad: a.entidad,
        detalle: a.detalle,
        creadoEn: a.creadoEn.toISOString(),
        usuario: a.usuario.nombre,
      })),
    };
  }

  /** Periodo AAAAMM derivado de la fecha del servidor. */
  private periodoActual(fecha: Date): string {
    const anio = fecha.getFullYear();
    const mes = String(fecha.getMonth() + 1).padStart(2, "0");
    return `${anio}${mes}`;
  }

  /**
   * Indicadores de inventario calculados con agregaciones en SQL sobre
   * item_stock y sku. valorTotal y valorDeteriorado se devuelven como string
   * (Decimal con 2 decimales). skusSinStock cuenta SKUs activos que no tienen
   * ninguna posicion con disponible > 0.
   */
  private async inventario(
    empresaId: bigint,
  ): Promise<DashboardResumen["inventario"]> {
    const [valores, skusActivos, posicionesConStock, sinStock] =
      await Promise.all([
        this.prisma.$queryRaw<
          Array<{ valor_total: string | null; valor_deteriorado: string | null }>
        >`
          SELECT
            COALESCE(SUM(cantidad_disponible * costo_promedio), 0) AS valor_total,
            COALESCE(SUM(cantidad_deteriorada * costo_promedio), 0) AS valor_deteriorado
          FROM item_stock
          WHERE empresa_id = ${empresaId}
        `,
        this.prisma.sku.count({ where: { empresaId, activo: true } }),
        this.prisma.itemStock.count({
          where: { empresaId, cantidadDisponible: { gt: 0 } },
        }),
        this.prisma.$queryRaw<Array<{ total: bigint }>>`
          SELECT COUNT(*)::bigint AS total
          FROM sku s
          WHERE s.empresa_id = ${empresaId}
            AND s.activo = true
            AND NOT EXISTS (
              SELECT 1 FROM item_stock i
              WHERE i.sku_id = s.id
                AND i.cantidad_disponible > 0
            )
        `,
      ]);

    return {
      valorTotal: new D(valores[0]?.valor_total ?? "0").toFixed(2),
      valorDeteriorado: new D(valores[0]?.valor_deteriorado ?? "0").toFixed(2),
      skusActivos,
      posicionesConStock,
      skusSinStock: Number(sinStock[0]?.total ?? 0n),
    };
  }

  /**
   * SKUs activos cuyo disponible TOTAL (sumado sobre todas sus posiciones) es
   * menor que su stockMinimo. Solo considera SKUs con stockMinimo definido.
   * Devuelve el conteo total y el top 6 por mayor faltante (stockMinimo -
   * disponible). La agregacion y el ranking se hacen en SQL.
   */
  private async topReposicion(
    empresaId: bigint,
  ): Promise<{ total: number; items: FilaReposicion[] }> {
    const filas = await this.prisma.$queryRaw<
      Array<{
        sku_id: bigint;
        codigo_parlante: string;
        producto: string;
        disponible: string;
        stock_minimo: string;
      }>
    >`
      SELECT
        s.id AS sku_id,
        s.codigo_parlante,
        p.nombre AS producto,
        COALESCE(t.disponible, 0) AS disponible,
        s.stock_minimo
      FROM sku s
      JOIN producto p ON p.id = s.producto_id
      LEFT JOIN (
        SELECT sku_id, SUM(cantidad_disponible) AS disponible
        FROM item_stock
        WHERE empresa_id = ${empresaId}
        GROUP BY sku_id
      ) t ON t.sku_id = s.id
      WHERE s.empresa_id = ${empresaId}
        AND s.activo = true
        AND s.stock_minimo IS NOT NULL
        AND COALESCE(t.disponible, 0) < s.stock_minimo
      ORDER BY (s.stock_minimo - COALESCE(t.disponible, 0)) DESC
    `;

    const items: FilaReposicion[] = filas.slice(0, 6).map((f) => {
      const disponible = new D(f.disponible);
      const stockMinimo = new D(f.stock_minimo);
      const sugerido = D.max(stockMinimo.sub(disponible), new D(0));
      return {
        skuId: f.sku_id.toString(),
        codigoParlante: f.codigo_parlante,
        producto: f.producto,
        disponible: disponible.toFixed(8),
        stockMinimo: stockMinimo.toFixed(8),
        sugerido: sugerido.toFixed(8),
      };
    });

    return { total: filas.length, items };
  }
}
