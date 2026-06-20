import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../comun/prisma/prisma.service.js";

interface NuevaCotizacion {
  proveedorId: bigint;
  skuId: bigint;
  moneda?: string;
  precioUnitario: string;
  fechaCotizacion: Date;
  numeroCotizacion?: string;
  ordenCompraRef?: string;
}

interface CambioCotizacion {
  moneda?: string;
  precioUnitario?: string;
  fechaCotizacion?: Date;
  numeroCotizacion?: string;
  ordenCompraRef?: string;
}

@Injectable()
export class CotizacionesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Registra una cotizacion. Valida que proveedor y SKU pertenezcan a la empresa (anti-IDOR). */
  async crear(empresaId: bigint, dto: NuevaCotizacion) {
    await this.validarPertenencia(empresaId, dto.proveedorId, dto.skuId);
    const cotizacion = await this.prisma.cotizacionProveedor.create({
      data: {
        empresaId,
        proveedorId: dto.proveedorId,
        skuId: dto.skuId,
        moneda: dto.moneda ?? "PEN",
        precioUnitario: new Prisma.Decimal(dto.precioUnitario),
        fechaCotizacion: dto.fechaCotizacion,
        numeroCotizacion: dto.numeroCotizacion,
        ordenCompraRef: dto.ordenCompraRef,
      },
    });
    return { id: cotizacion.id.toString() };
  }

  /** Edita una cotizacion. Valida pertenencia a la empresa. */
  async actualizar(empresaId: bigint, id: bigint, dto: CambioCotizacion) {
    const cotizacion = await this.prisma.cotizacionProveedor.findFirst({
      where: { id, empresaId },
    });
    if (!cotizacion) throw new NotFoundException("Cotizacion no encontrada");
    await this.prisma.cotizacionProveedor.update({
      where: { id },
      data: {
        moneda: dto.moneda,
        precioUnitario:
          dto.precioUnitario !== undefined
            ? new Prisma.Decimal(dto.precioUnitario)
            : undefined,
        fechaCotizacion: dto.fechaCotizacion,
        numeroCotizacion: dto.numeroCotizacion,
        ordenCompraRef: dto.ordenCompraRef,
      },
    });
    return { id: id.toString() };
  }

  /** Elimina una cotizacion. Valida pertenencia a la empresa. */
  async eliminar(empresaId: bigint, id: bigint) {
    const cotizacion = await this.prisma.cotizacionProveedor.findFirst({
      where: { id, empresaId },
    });
    if (!cotizacion) throw new NotFoundException("Cotizacion no encontrada");
    await this.prisma.cotizacionProveedor.delete({ where: { id } });
    return { id: id.toString(), eliminado: true };
  }

  /** Detalle de una cotizacion. Valida pertenencia a la empresa. */
  async obtener(empresaId: bigint, id: bigint) {
    const c = await this.prisma.cotizacionProveedor.findFirst({
      where: { id, empresaId },
      include: { proveedor: true, sku: true },
    });
    if (!c) throw new NotFoundException("Cotizacion no encontrada");
    return {
      id: c.id.toString(),
      proveedorId: c.proveedorId.toString(),
      proveedorRazonSocial: c.proveedor.razonSocial,
      proveedorRuc: c.proveedor.ruc,
      skuId: c.skuId.toString(),
      codigoSku: c.sku.codigoParlante,
      nombreSku: c.sku.nombre,
      moneda: c.moneda,
      precioUnitario: c.precioUnitario.toString(),
      fechaCotizacion: c.fechaCotizacion.toISOString(),
      numeroCotizacion: c.numeroCotizacion,
      ordenCompraRef: c.ordenCompraRef,
    };
  }

  /**
   * Lista las cotizaciones de un SKU agrupadas por proveedor, devolviendo el
   * ULTIMO precio (por fechaCotizacion) de cada proveedor. Ordenado por precio
   * ascendente para identificar la mejor oferta.
   */
  async ultimoPrecioPorProveedor(empresaId: bigint, skuId: bigint) {
    const sku = await this.prisma.sku.findFirst({ where: { id: skuId, empresaId } });
    if (!sku) throw new NotFoundException("SKU no encontrado");

    const filas = await this.prisma.cotizacionProveedor.findMany({
      where: { empresaId, skuId },
      orderBy: { fechaCotizacion: "desc" },
      include: { proveedor: true },
    });

    // Primera fila por proveedor = la mas reciente (orden desc por fecha).
    const ultimoPorProveedor = new Map<string, (typeof filas)[number]>();
    for (const fila of filas) {
      const clave = fila.proveedorId.toString();
      if (!ultimoPorProveedor.has(clave)) ultimoPorProveedor.set(clave, fila);
    }

    return [...ultimoPorProveedor.values()]
      .map((c) => ({
        cotizacionId: c.id.toString(),
        proveedorId: c.proveedorId.toString(),
        proveedorRazonSocial: c.proveedor.razonSocial,
        proveedorRuc: c.proveedor.ruc,
        moneda: c.moneda,
        precioUnitario: c.precioUnitario.toString(),
        fechaCotizacion: c.fechaCotizacion.toISOString(),
        numeroCotizacion: c.numeroCotizacion,
        ordenCompraRef: c.ordenCompraRef,
      }))
      .sort((a, b) =>
        new Prisma.Decimal(a.precioUnitario).comparedTo(
          new Prisma.Decimal(b.precioUnitario),
        ),
      );
  }

  private async validarPertenencia(
    empresaId: bigint,
    proveedorId: bigint,
    skuId: bigint,
  ) {
    const proveedor = await this.prisma.proveedor.findFirst({
      where: { id: proveedorId, empresaId },
    });
    if (!proveedor) throw new NotFoundException("Proveedor no encontrado");
    const sku = await this.prisma.sku.findFirst({ where: { id: skuId, empresaId } });
    if (!sku) throw new NotFoundException("SKU no encontrado");
  }
}
