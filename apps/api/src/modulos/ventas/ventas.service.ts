import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../comun/prisma/prisma.service.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { MovimientoService } from "../inventario/movimientos/movimiento.service.js";

const D = Prisma.Decimal;

/** Tasa de IGV vigente en Peru (18%). */
const IGV_TASA = new D("0.18");

interface NuevaOrdenVenta {
  almacenId: bigint;
  numero: string;
  clienteId?: bigint;
  cliente?: string;
  moneda?: string;
  tipoCambio?: string;
  observaciones?: string;
  lineas: Array<{ skuId: bigint; cantidad: string; precioUnitario?: string }>;
}

interface ComprobanteEntrada {
  tipoDocumentoSunat: string;
  serie: string;
  numero: string;
  fechaEmision: Date;
  moneda?: string;
  tipoCambio?: string;
  subtotal: string;
  igv: string;
  total: string;
}

interface Despacho {
  ordenVentaId: bigint;
  comprobante: ComprobanteEntrada;
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
    // Si se provee clienteId, validar pertenencia a la empresa (anti-IDOR).
    if (dto.clienteId !== undefined) {
      const cliente = await this.prisma.cliente.findFirst({
        where: { id: dto.clienteId, empresaId: usuario.empresaId },
      });
      if (!cliente) throw new NotFoundException("Cliente no encontrado");
    }

    let subtotal = new D(0);
    for (const l of dto.lineas) {
      subtotal = subtotal.add(new D(l.cantidad).mul(new D(l.precioUnitario ?? "0")));
    }
    const igv = subtotal.mul(IGV_TASA);
    const total = subtotal.add(igv);

    const orden = await this.prisma.ordenVenta.create({
      data: {
        empresaId: usuario.empresaId,
        almacenId: dto.almacenId,
        numero: dto.numero,
        clienteId: dto.clienteId ?? null,
        cliente: dto.cliente ?? null,
        moneda: dto.moneda ?? "PEN",
        tipoCambio: dto.tipoCambio ?? null,
        subtotal,
        igv,
        total,
        observaciones: dto.observaciones ?? null,
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

    return {
      id: orden.id.toString(),
      numero: orden.numero,
      subtotal: subtotal.toString(),
      igv: igv.toString(),
      total: total.toString(),
    };
  }

  async listarOrdenes(empresaId: bigint) {
    const ordenes = await this.prisma.ordenVenta.findMany({
      where: { empresaId },
      include: { lineas: true, clienteRef: true },
      orderBy: { fechaEmision: "desc" },
    });
    const skus = await this.cargarSkus(
      empresaId,
      ordenes.flatMap((o) => o.lineas.map((l) => l.skuId)),
    );
    return ordenes.map((o) => ({
      id: o.id.toString(),
      numero: o.numero,
      clienteId: o.clienteId ? o.clienteId.toString() : null,
      cliente: o.clienteRef ? o.clienteRef.razonSocial : o.cliente,
      estado: o.estado,
      moneda: o.moneda,
      tipoCambio: o.tipoCambio ? o.tipoCambio.toString() : null,
      subtotal: o.subtotal.toString(),
      igv: o.igv.toString(),
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

  /**
   * Despacho (parcial): registra el comprobante de venta (OBLIGATORIO, sustento
   * SUNAT) y genera las salidas del ledger DESDE la reserva, enlazando cada
   * movimiento al comprobante real (documentoId + serie/numero/tipoDoc/fecha).
   * Un comprobante por despacho. Requiere que la orden tenga cliente identificado.
   */
  async despachar(usuario: UsuarioRequest, dto: Despacho) {
    const orden = await this.prisma.ordenVenta.findFirst({
      where: { id: dto.ordenVentaId, empresaId: usuario.empresaId },
      include: { lineas: true },
    });
    if (!orden) throw new NotFoundException("Orden de venta no encontrada");
    if (orden.estado === "DESPACHADA" || orden.estado === "ANULADA") {
      throw new BadRequestException(`La orden esta ${orden.estado}`);
    }
    if (orden.clienteId === null) {
      throw new BadRequestException(
        "La orden no tiene cliente identificado; no se puede emitir comprobante",
      );
    }

    // Validar todas las lineas antes de tocar el ledger o crear el comprobante.
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
    }

    const c = dto.comprobante;
    const comprobante = await this.prisma.comprobanteVenta.create({
      data: {
        empresaId: usuario.empresaId,
        ordenVentaId: orden.id,
        clienteId: orden.clienteId,
        tipoDocumentoSunat: c.tipoDocumentoSunat,
        serie: c.serie,
        numero: c.numero,
        fechaEmision: c.fechaEmision,
        moneda: c.moneda ?? orden.moneda,
        tipoCambio: c.tipoCambio ?? null,
        subtotal: c.subtotal,
        igv: c.igv,
        total: c.total,
      },
    });

    for (const linea of dto.lineas) {
      const ovLinea = orden.lineas.find((l) => l.id === linea.ordenVentaLineaId)!;
      const despachar = new D(linea.cantidad);

      await this.movimientos.registrarSalidaVenta(usuario, {
        skuId: ovLinea.skuId,
        almacenId: orden.almacenId,
        cantidad: linea.cantidad,
        desdeReserva: true,
        documentoId: comprobante.id,
        tipoDocumentoSunat: c.tipoDocumentoSunat,
        serieComprobante: c.serie,
        numeroComprobante: c.numero,
        fechaEmisionDocumento: c.fechaEmision,
        observaciones: `Despacho OV ${orden.numero}`,
      });

      await this.prisma.ordenVentaLinea.update({
        where: { id: ovLinea.id },
        data: { cantidadDespachada: { increment: despachar } },
      });
    }

    await this.recalcularEstado(orden.id);
    return { ok: true, comprobanteId: comprobante.id.toString() };
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
