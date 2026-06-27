import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../comun/prisma/prisma.service.js";

interface NuevoCliente {
  tipoDocIdentidad?: string;
  numeroDoc: string;
  razonSocial: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  tipoPrecio?: number;
  vendedorId?: number;
}

interface CambioCliente {
  tipoDocIdentidad?: string;
  numeroDoc?: string;
  razonSocial?: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  tipoPrecio?: number;
  vendedorId?: number;
}

@Injectable()
export class ClientesService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(empresaId: bigint, dto: NuevoCliente) {
    const { vendedorId, ...resto } = dto;
    const vendedorIdBig = await this.resolverVendedor(empresaId, vendedorId);
    const cliente = await this.prisma.cliente.create({
      data: { empresaId, ...resto, vendedorId: vendedorIdBig },
    });
    return { id: cliente.id.toString() };
  }

  /** Edita un cliente. Valida pertenencia a la empresa (anti-IDOR). */
  async actualizar(empresaId: bigint, id: bigint, dto: CambioCliente) {
    const cliente = await this.prisma.cliente.findFirst({ where: { id, empresaId } });
    if (!cliente) throw new NotFoundException("Cliente no encontrado");
    const { vendedorId, ...resto } = dto;
    const data: Record<string, unknown> = { ...resto };
    if (vendedorId !== undefined) {
      data.vendedorId = await this.resolverVendedor(empresaId, vendedorId);
    }
    await this.prisma.cliente.update({ where: { id }, data });
    return { id: id.toString() };
  }

  /** Valida que el vendedor pertenezca a la empresa (anti-IDOR) y lo devuelve. */
  private async resolverVendedor(
    empresaId: bigint,
    vendedorId?: number,
  ): Promise<bigint | null> {
    if (vendedorId === undefined) return null;
    const vendedor = await this.prisma.vendedor.findFirst({
      where: { id: BigInt(vendedorId), empresaId },
    });
    if (!vendedor) throw new NotFoundException("Vendedor no encontrado");
    return vendedor.id;
  }

  /** Baja logica del cliente. Valida pertenencia a la empresa. */
  async desactivar(empresaId: bigint, id: bigint) {
    const cliente = await this.prisma.cliente.findFirst({ where: { id, empresaId } });
    if (!cliente) throw new NotFoundException("Cliente no encontrado");
    await this.prisma.cliente.update({ where: { id }, data: { activo: false } });
    return { id: id.toString(), activo: false };
  }

  /** Reactiva un cliente dado de baja. Valida pertenencia a la empresa. */
  async reactivar(empresaId: bigint, id: bigint) {
    const cliente = await this.prisma.cliente.findFirst({ where: { id, empresaId } });
    if (!cliente) throw new NotFoundException("Cliente no encontrado");
    await this.prisma.cliente.update({ where: { id }, data: { activo: true } });
    return { id: id.toString(), activo: true };
  }

  /** Lista clientes. Por defecto solo activos; incluye inactivos si se pide. */
  async listar(empresaId: bigint, incluirInactivos = false) {
    const filas = await this.prisma.cliente.findMany({
      where: { empresaId, ...(incluirInactivos ? {} : { activo: true }) },
      orderBy: { razonSocial: "asc" },
    });
    return filas.map((c) => ({
      id: c.id.toString(),
      tipoDocIdentidad: c.tipoDocIdentidad,
      numeroDoc: c.numeroDoc,
      razonSocial: c.razonSocial,
      direccion: c.direccion,
      telefono: c.telefono,
      email: c.email,
      tipoPrecio: c.tipoPrecio,
      vendedorId: c.vendedorId ? c.vendedorId.toString() : null,
      activo: c.activo,
    }));
  }
}
