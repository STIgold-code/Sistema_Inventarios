import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../comun/prisma/prisma.service.js";

interface NuevoCliente {
  tipoDocIdentidad?: string;
  numeroDoc: string;
  razonSocial: string;
  direccion?: string;
  telefono?: string;
  email?: string;
}

interface CambioCliente {
  tipoDocIdentidad?: string;
  numeroDoc?: string;
  razonSocial?: string;
  direccion?: string;
  telefono?: string;
  email?: string;
}

@Injectable()
export class ClientesService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(empresaId: bigint, dto: NuevoCliente) {
    const cliente = await this.prisma.cliente.create({
      data: { empresaId, ...dto },
    });
    return { id: cliente.id.toString() };
  }

  /** Edita un cliente. Valida pertenencia a la empresa (anti-IDOR). */
  async actualizar(empresaId: bigint, id: bigint, dto: CambioCliente) {
    const cliente = await this.prisma.cliente.findFirst({ where: { id, empresaId } });
    if (!cliente) throw new NotFoundException("Cliente no encontrado");
    await this.prisma.cliente.update({ where: { id }, data: { ...dto } });
    return { id: id.toString() };
  }

  /** Baja logica del cliente. Valida pertenencia a la empresa. */
  async desactivar(empresaId: bigint, id: bigint) {
    const cliente = await this.prisma.cliente.findFirst({ where: { id, empresaId } });
    if (!cliente) throw new NotFoundException("Cliente no encontrado");
    await this.prisma.cliente.update({ where: { id }, data: { activo: false } });
    return { id: id.toString(), activo: false };
  }

  async listar(empresaId: bigint) {
    const filas = await this.prisma.cliente.findMany({
      where: { empresaId, activo: true },
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
    }));
  }
}
