import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../comun/prisma/prisma.service.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { MovimientoService } from "../inventario/movimientos/movimiento.service.js";

const D = Prisma.Decimal;

interface NuevaOrdenVenta {
  almacenId: bigint;
  numero: string;
  cliente?: string;
  observaciones?: string;
  lineas: Array<{ skuId: bigint; cantidad: string; precioUnitario?: string }>;
}

interface Despacho {
  ordenVentaId: bigint;
  tipoDocumentoSunat?: string;
  serieComprobante?: string;
  numeroComprobante?: string;
  lineas: Array<{ ordenVentaLineaId: bigint; cantidad: string }>;
}

@Injectable()
export class VentasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly movimientos: MovimientoService,
  ) {}

  /**
   * Crea la orden y RESERVA el stock de cada linea. Si una reserva falla,
   * libera las reservas previas y elimina la orden (atomicidad efectiva).
   */
  async crearOrdenVenta(usuario: UsuarioRequest, dto: NuevaOrdenVenta) {
    let total = new D(0);
    for (const l of dto.lineas) {
      total = total.add(new D(l.cantidad).mul(new D(l.precioUnitario ?? "0")));
    }

    const orden = await this.prisma.ordenVenta.create({
      data: {
        empresaId: usuario.empresaId,
        almacenId: dto.almacenId,
        numero: dto.numero,
        cliente: dto.cliente ?? null,
        observaciones: dto.observaciones ?? null,
        total,
        usuarioId: usuario.id,
        lineas: {
          create: dto.lineas.map((l) => ({
            empresaId: usuario.empresaId,
            skuId: l.skuId,
            cantidad: l.cantidad,
            precioUnitario: l.precioUnitario ?? "0",
          })),
        },
      },
    });

    // Reservar cada linea; si una falla, revertir las previas y borrar la orden.
    const reservadas: Array<{ skuId: bigint; cantidad: string }> = [];
    try {
      for (const l of dto.lineas) {
        await this.movimientos.reservar(usuario, {
          skuId: l.skuId,
          almacenId: dto.almacenId,
          cantidad: l.cantidad,
        });
        reservadas.push({ skuId: l.skuId, cantidad: l.cantidad });
      }
    } catch (error) {
      for (const r of reservadas) {
        await this.movimientos.liberarReserva(usuario, {
          skuId: r.skuId,
          almacenId: dto.almacenId,
          cantidad: r.cantidad,
        });
      }
      await this.prisma.ordenVentaLinea.deleteMany({ where: { ordenVentaId: orden.id } });
      await this.prisma.ordenVenta.delete({ where: { id: orden.id } });
      throw error;
    }

    return { id: orden.id.toString(), total: total.toString() };
  }

  async listarOrdenes(empresaId: bigint) {
    const ordenes = await this.prisma.ordenVenta.findMany({
      where: { empresaId },
      include: { lineas: true },
      orderBy: { fechaEmision: "desc" },
    });
    const skus = await this.cargarSkus(
      empresaId,
      ordenes.flatMap((o) => o.lineas.map((l) => l.skuId)),
    );
    return ordenes.map((o) => ({
      id: o.id.toString(),
      numero: o.numero,
      cliente: o.cliente,
      estado: o.estado,
      total: o.total.toString(),
      lineas: o.lineas.map((l) => ({
        id: l.id.toString(),
        skuId: l.skuId.toString(),
        codigoSku: skus.get(l.skuId.toString())?.codigo ?? "",
        nombreSku: skus.get(l.skuId.toString())?.nombre ?? `SKU ${l.skuId}`,
        cantidad: l.cantidad.toString(),
        cantidadDespachada: l.cantidadDespachada.toString(),
        pendiente: new D(l.cantidad).sub(new D(l.cantidadDespachada)).toString(),
      })),
    }));
  }

  /** Mapa skuId -> {codigo, nombre} para enriquecer las lineas de orden. */
  private async cargarSkus(
    empresaId: bigint,
    ids: bigint[],
  ): Promise<Map<string, { codigo: string; nombre: string }>> {
    if (ids.length === 0) return new Map();
    const skus = await this.prisma.sku.findMany({
      where: { empresaId, id: { in: [...new Set(ids)] } },
      include: { producto: true },
    });
    return new Map(
      skus.map((s) => [
        s.id.toString(),
        { codigo: s.codigoParlante, nombre: s.nombre ?? s.producto.nombre },
      ]),
    );
  }

  /** Despacho (parcial): genera salidas del ledger DESDE la reserva. */
  async despachar(usuario: UsuarioRequest, dto: Despacho) {
    const orden = await this.prisma.ordenVenta.findFirst({
      where: { id: dto.ordenVentaId, empresaId: usuario.empresaId },
      include: { lineas: true },
    });
    if (!orden) throw new NotFoundException("Orden de venta no encontrada");
    if (orden.estado === "DESPACHADA" || orden.estado === "ANULADA") {
      throw new BadRequestException(`La orden esta ${orden.estado}`);
    }

    for (const linea of dto.lineas) {
      const ovLinea = orden.lineas.find((l) => l.id === linea.ordenVentaLineaId);
      if (!ovLinea) {
        throw new BadRequestException(`Linea ${linea.ordenVentaLineaId} no pertenece a la orden`);
      }
      const pendiente = new D(ovLinea.cantidad).sub(new D(ovLinea.cantidadDespachada));
      const despachar = new D(linea.cantidad);
      if (despachar.greaterThan(pendiente)) {
        throw new BadRequestException(
          `La linea excede lo pendiente: pendiente ${pendiente.toString()}, despacho ${despachar.toString()}`,
        );
      }

      await this.movimientos.registrarSalidaVenta(usuario, {
        skuId: ovLinea.skuId,
        almacenId: orden.almacenId,
        cantidad: linea.cantidad,
        desdeReserva: true,
        tipoDocumentoSunat: dto.tipoDocumentoSunat,
        serieComprobante: dto.serieComprobante,
        numeroComprobante: dto.numeroComprobante,
        observaciones: `Despacho OV ${orden.numero}`,
      });

      await this.prisma.ordenVentaLinea.update({
        where: { id: ovLinea.id },
        data: { cantidadDespachada: { increment: despachar } },
      });
    }

    await this.recalcularEstado(orden.id);
    return { ok: true };
  }

  /** Anula una orden no despachada y libera sus reservas. */
  async anular(usuario: UsuarioRequest, ordenVentaId: bigint) {
    const orden = await this.prisma.ordenVenta.findFirst({
      where: { id: ordenVentaId, empresaId: usuario.empresaId },
      include: { lineas: true },
    });
    if (!orden) throw new NotFoundException("Orden de venta no encontrada");
    if (orden.estado === "DESPACHADA") {
      throw new BadRequestException("No se puede anular una orden ya despachada");
    }

    for (const linea of orden.lineas) {
      const pendienteReserva = new D(linea.cantidad).sub(new D(linea.cantidadDespachada));
      if (pendienteReserva.greaterThan(0)) {
        await this.movimientos.liberarReserva(usuario, {
          skuId: linea.skuId,
          almacenId: orden.almacenId,
          cantidad: pendienteReserva.toString(),
        });
      }
    }
    await this.prisma.ordenVenta.update({
      where: { id: orden.id },
      data: { estado: "ANULADA" },
    });
    return { ok: true };
  }

  private async recalcularEstado(ordenId: bigint): Promise<void> {
    const lineas = await this.prisma.ordenVentaLinea.findMany({
      where: { ordenVentaId: ordenId },
    });
    const todo = lineas.every((l) =>
      new D(l.cantidadDespachada).greaterThanOrEqualTo(new D(l.cantidad)),
    );
    const algo = lineas.some((l) => new D(l.cantidadDespachada).greaterThan(0));
    const estado = todo ? "DESPACHADA" : algo ? "PARCIAL" : "PENDIENTE";
    await this.prisma.ordenVenta.update({ where: { id: ordenId }, data: { estado } });
  }
}
