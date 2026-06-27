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
import { ParametrosService } from "../parametros/parametros.service.js";
import { VentasService } from "../ventas/ventas.service.js";

const D = Prisma.Decimal;

interface NuevoPedido {
  almacenId: bigint;
  numero: string;
  clienteId?: bigint;
  vendedorId?: bigint;
  fechaEntrega?: Date;
  moneda?: string;
  tipoCambio?: string;
  observaciones?: string;
  lineas: Array<{ skuId: bigint; cantidad: string; precioUnitario?: string }>;
}

@Injectable()
export class PedidosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly parametros: ParametrosService,
    private readonly ventas: VentasService,
  ) {}

  async crear(usuario: UsuarioRequest, dto: NuevoPedido) {
    if (dto.clienteId !== undefined) {
      const c = await this.prisma.cliente.findFirst({
        where: { id: dto.clienteId, empresaId: usuario.empresaId },
      });
      if (!c) throw new NotFoundException("Cliente no encontrado");
    }
    if (dto.vendedorId !== undefined) {
      const v = await this.prisma.vendedor.findFirst({
        where: { id: dto.vendedorId, empresaId: usuario.empresaId },
      });
      if (!v) throw new NotFoundException("Vendedor no encontrado");
    }

    let subtotal = new D(0);
    for (const l of dto.lineas) {
      subtotal = subtotal.add(new D(l.cantidad).mul(new D(l.precioUnitario ?? "0")));
    }
    const igv = subtotal.mul(await this.parametros.tasaIgv(usuario.empresaId));
    const total = subtotal.add(igv);

    const pedido = await this.prisma.pedido.create({
      data: {
        empresaId: usuario.empresaId,
        almacenId: dto.almacenId,
        clienteId: dto.clienteId ?? null,
        vendedorId: dto.vendedorId ?? null,
        numero: dto.numero,
        fechaEntrega: dto.fechaEntrega ?? null,
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
    return { id: pedido.id.toString(), numero: pedido.numero };
  }

  async aprobar(usuario: UsuarioRequest, id: bigint) {
    const r = await this.prisma.pedido.updateMany({
      where: { id, empresaId: usuario.empresaId, estado: "BORRADOR" },
      data: { estado: "APROBADO", aprobadoPorId: usuario.id },
    });
    if (r.count === 0) {
      throw new ConflictException("El pedido ya no está en BORRADOR.");
    }
    await this.auditoria.registrar({
      empresaId: usuario.empresaId,
      usuarioId: usuario.id,
      accion: "APROBAR",
      entidad: "PEDIDO",
      entidadId: id,
      detalle: `Pedido aprobado`,
    });
    return { id: id.toString(), estado: "APROBADO" };
  }

  async anular(usuario: UsuarioRequest, id: bigint) {
    const r = await this.prisma.pedido.updateMany({
      where: {
        id,
        empresaId: usuario.empresaId,
        estado: { in: ["BORRADOR", "APROBADO"] },
      },
      data: { estado: "ANULADO" },
    });
    if (r.count === 0) {
      throw new ConflictException("Solo se puede anular un pedido en BORRADOR o APROBADO.");
    }
    await this.auditoria.registrar({
      empresaId: usuario.empresaId,
      usuarioId: usuario.id,
      accion: "ANULAR",
      entidad: "PEDIDO",
      entidadId: id,
      detalle: `Pedido anulado`,
    });
    return { id: id.toString(), estado: "ANULADO" };
  }

  /**
   * Genera una orden de venta a partir de un pedido APROBADO con la cantidad
   * PENDIENTE de cada línea. Marca el pedido como ATENDIDO. (MVP: atención total.)
   */
  async generarOrdenVenta(usuario: UsuarioRequest, id: bigint, numeroOrden: string) {
    const pedido = await this.prisma.pedido.findFirst({
      where: { id, empresaId: usuario.empresaId },
      include: { lineas: true },
    });
    if (!pedido) throw new NotFoundException("Pedido no encontrado");
    if (pedido.estado !== "APROBADO" && pedido.estado !== "ATENDIDO_PARCIAL") {
      throw new BadRequestException("Solo se puede atender un pedido APROBADO.");
    }

    const pendientes = pedido.lineas
      .map((l) => ({ l, pend: new D(l.cantidad).sub(new D(l.cantidadAtendida)) }))
      .filter(({ pend }) => pend.greaterThan(0));
    if (pendientes.length === 0) {
      throw new BadRequestException("El pedido no tiene cantidades pendientes de atender.");
    }

    const orden = await this.ventas.crearOrdenVenta(usuario, {
      almacenId: pedido.almacenId,
      numero: numeroOrden,
      clienteId: pedido.clienteId ?? undefined,
      vendedorId: pedido.vendedorId ?? undefined,
      moneda: pedido.moneda,
      tipoCambio: pedido.tipoCambio ? pedido.tipoCambio.toString() : undefined,
      observaciones: `Pedido ${pedido.numero}`,
      lineas: pendientes.map(({ l, pend }) => ({
        skuId: l.skuId,
        cantidad: pend.toString(),
        precioUnitario: l.precioUnitario.toString(),
      })),
    });

    // Atención total (MVP): marca cada línea como atendida y cierra el pedido.
    await this.prisma.$transaction(async (tx) => {
      for (const { l } of pendientes) {
        await tx.pedidoLinea.update({
          where: { id: l.id },
          data: { cantidadAtendida: l.cantidad },
        });
      }
      await tx.pedido.update({ where: { id: pedido.id }, data: { estado: "ATENDIDO" } });
      await this.auditoria.registrar(
        {
          empresaId: usuario.empresaId,
          usuarioId: usuario.id,
          accion: "ATENDER",
          entidad: "PEDIDO",
          entidadId: pedido.id,
          detalle: `Pedido ${pedido.numero} atendido con orden ${numeroOrden}`,
        },
        tx,
      );
    });

    return { id: pedido.id.toString(), ordenVentaId: orden.id, ordenNumero: orden.numero };
  }

  async listar(empresaId: bigint) {
    const filas = await this.prisma.pedido.findMany({
      where: { empresaId },
      include: { lineas: true },
      orderBy: { fechaEmision: "desc" },
    });
    const skuIds = [...new Set(filas.flatMap((p) => p.lineas.map((l) => l.skuId)))];
    const skus = await this.prisma.sku.findMany({
      where: { id: { in: skuIds }, empresaId },
      select: { id: true, codigoParlante: true, nombre: true },
    });
    const skuPorId = new Map(skus.map((s) => [s.id.toString(), s]));
    return filas.map((p) => ({
      id: p.id.toString(),
      numero: p.numero,
      estado: p.estado,
      fechaEmision: p.fechaEmision.toISOString(),
      total: p.total.toString(),
      observaciones: p.observaciones,
      lineas: p.lineas.map((l) => {
        const sku = skuPorId.get(l.skuId.toString());
        return {
          id: l.id.toString(),
          skuId: l.skuId.toString(),
          codigoSku: sku ? sku.codigoParlante : null,
          nombreSku: sku ? sku.nombre : null,
          cantidad: l.cantidad.toString(),
          cantidadAtendida: l.cantidadAtendida.toString(),
          porAtender: new D(l.cantidad).sub(new D(l.cantidadAtendida)).toString(),
          precioUnitario: l.precioUnitario.toString(),
        };
      }),
    }));
  }
}
