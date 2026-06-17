import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../comun/prisma/prisma.service.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { MovimientoService } from "../inventario/movimientos/movimiento.service.js";

const D = Prisma.Decimal;

interface NuevoProveedor {
  ruc: string;
  razonSocial: string;
  direccion?: string;
  telefono?: string;
  email?: string;
}

interface NuevaOrden {
  proveedorId: bigint;
  almacenId: bigint;
  numero: string;
  observaciones?: string;
  lineas: Array<{ skuId: bigint; cantidad: string; costoUnitario: string }>;
}

interface Recepcion {
  ordenCompraId: bigint;
  tipoDocumentoSunat?: string;
  serieComprobante?: string;
  numeroComprobante?: string;
  lineas: Array<{ ordenCompraLineaId: bigint; cantidad: string }>;
}

@Injectable()
export class ComprasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly movimientos: MovimientoService,
  ) {}

  async crearProveedor(empresaId: bigint, dto: NuevoProveedor) {
    const proveedor = await this.prisma.proveedor.create({
      data: { empresaId, ...dto },
    });
    return { id: proveedor.id.toString() };
  }

  async listarProveedores(empresaId: bigint) {
    const filas = await this.prisma.proveedor.findMany({
      where: { empresaId, activo: true },
      orderBy: { razonSocial: "asc" },
    });
    return filas.map((p) => ({
      id: p.id.toString(),
      ruc: p.ruc,
      razonSocial: p.razonSocial,
    }));
  }

  /** Crea la OC con sus lineas y calcula el total. Estado inicial EMITIDA. */
  async crearOrdenCompra(usuario: UsuarioRequest, dto: NuevaOrden) {
    const proveedor = await this.prisma.proveedor.findFirst({
      where: { id: dto.proveedorId, empresaId: usuario.empresaId },
    });
    if (!proveedor) throw new NotFoundException("Proveedor no encontrado");

    let total = new D(0);
    for (const l of dto.lineas) {
      total = total.add(new D(l.cantidad).mul(new D(l.costoUnitario)));
    }

    const orden = await this.prisma.ordenCompra.create({
      data: {
        empresaId: usuario.empresaId,
        proveedorId: dto.proveedorId,
        almacenId: dto.almacenId,
        numero: dto.numero,
        estado: "EMITIDA",
        total,
        observaciones: dto.observaciones ?? null,
        usuarioId: usuario.id,
        lineas: {
          create: dto.lineas.map((l) => ({
            empresaId: usuario.empresaId,
            skuId: l.skuId,
            cantidad: l.cantidad,
            costoUnitario: l.costoUnitario,
          })),
        },
      },
    });
    return { id: orden.id.toString(), total: total.toString() };
  }

  async listarOrdenes(empresaId: bigint) {
    const ordenes = await this.prisma.ordenCompra.findMany({
      where: { empresaId },
      include: { proveedor: true, lineas: true },
      orderBy: { fechaEmision: "desc" },
    });
    const skus = await this.cargarSkus(
      empresaId,
      ordenes.flatMap((o) => o.lineas.map((l) => l.skuId)),
    );
    return ordenes.map((o) => ({
      id: o.id.toString(),
      numero: o.numero,
      estado: o.estado,
      proveedor: o.proveedor.razonSocial,
      total: o.total.toString(),
      lineas: o.lineas.map((l) => ({
        id: l.id.toString(),
        skuId: l.skuId.toString(),
        codigoSku: skus.get(l.skuId.toString())?.codigo ?? "",
        nombreSku: skus.get(l.skuId.toString())?.nombre ?? `SKU ${l.skuId}`,
        cantidad: l.cantidad.toString(),
        costoUnitario: l.costoUnitario.toString(),
        cantidadRecibida: l.cantidadRecibida.toString(),
        pendiente: new D(l.cantidad).sub(new D(l.cantidadRecibida)).toString(),
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
   * Recepcion parcial: por cada linea recibida valida el pendiente, genera la
   * entrada en el ledger (MovimientoService.recibirCompra) y actualiza la OC.
   */
  async recibir(usuario: UsuarioRequest, dto: Recepcion) {
    const orden = await this.prisma.ordenCompra.findFirst({
      where: { id: dto.ordenCompraId, empresaId: usuario.empresaId },
      include: { lineas: true },
    });
    if (!orden) throw new NotFoundException("Orden de compra no encontrada");
    if (orden.estado === "COMPLETA" || orden.estado === "ANULADA") {
      throw new BadRequestException(`La orden esta ${orden.estado}`);
    }

    const recepcion = await this.prisma.recepcion.create({
      data: {
        empresaId: usuario.empresaId,
        ordenCompraId: orden.id,
        tipoDocumentoSunat: dto.tipoDocumentoSunat ?? "01",
        serieComprobante: dto.serieComprobante ?? null,
        numeroComprobante: dto.numeroComprobante ?? null,
        usuarioId: usuario.id,
      },
    });

    for (const linea of dto.lineas) {
      const ocLinea = orden.lineas.find((l) => l.id === linea.ordenCompraLineaId);
      if (!ocLinea) {
        throw new BadRequestException(`Linea ${linea.ordenCompraLineaId} no pertenece a la orden`);
      }
      const pendiente = new D(ocLinea.cantidad).sub(new D(ocLinea.cantidadRecibida));
      const recibir = new D(linea.cantidad);
      if (recibir.greaterThan(pendiente)) {
        throw new BadRequestException(
          `La linea excede lo pendiente: pendiente ${pendiente.toString()}, recibido ${recibir.toString()}`,
        );
      }

      // Genera la entrada en el ledger con el costo de la OC.
      const mov = await this.movimientos.recibirCompra(usuario, {
        skuId: ocLinea.skuId,
        almacenId: orden.almacenId,
        cantidad: linea.cantidad,
        costoUnitario: ocLinea.costoUnitario.toString(),
        tipoDocumentoSunat: dto.tipoDocumentoSunat,
        serieComprobante: dto.serieComprobante,
        numeroComprobante: dto.numeroComprobante,
        observaciones: `Recepcion OC ${orden.numero}`,
      });

      await this.prisma.recepcionLinea.create({
        data: {
          empresaId: usuario.empresaId,
          recepcionId: recepcion.id,
          ordenCompraLineaId: ocLinea.id,
          skuId: ocLinea.skuId,
          cantidad: linea.cantidad,
          movimientoStockId: BigInt(mov.movimientoId),
        },
      });

      await this.prisma.ordenCompraLinea.update({
        where: { id: ocLinea.id },
        data: { cantidadRecibida: { increment: recibir } },
      });
    }

    await this.recalcularEstado(orden.id);
    return { recepcionId: recepcion.id.toString() };
  }

  /** Actualiza el estado de la OC segun lo recibido vs lo pedido. */
  private async recalcularEstado(ordenId: bigint): Promise<void> {
    const lineas = await this.prisma.ordenCompraLinea.findMany({
      where: { ordenCompraId: ordenId },
    });
    const todoCompleto = lineas.every((l) =>
      new D(l.cantidadRecibida).greaterThanOrEqualTo(new D(l.cantidad)),
    );
    const algoRecibido = lineas.some((l) => new D(l.cantidadRecibida).greaterThan(0));
    const estado = todoCompleto ? "COMPLETA" : algoRecibido ? "PARCIAL" : "EMITIDA";
    await this.prisma.ordenCompra.update({ where: { id: ordenId }, data: { estado } });
  }
}
