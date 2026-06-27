import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../comun/prisma/prisma.service.js";

@Injectable()
export class VendedoresService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(empresaId: bigint) {
    const vendedores = await this.prisma.vendedor.findMany({
      where: { empresaId },
      orderBy: { codigo: "asc" },
    });
    return vendedores.map((v) => ({
      id: v.id.toString(),
      codigo: v.codigo,
      nombre: v.nombre,
      documento: v.documento,
      activo: v.activo,
    }));
  }

  async crear(
    empresaId: bigint,
    dto: { codigo: string; nombre: string; documento?: string },
  ) {
    try {
      const vendedor = await this.prisma.vendedor.create({
        data: {
          empresaId,
          codigo: dto.codigo,
          nombre: dto.nombre,
          documento: dto.documento ?? null,
        },
      });
      return { id: vendedor.id.toString() };
    } catch (error) {
      throw this.traducirError(error, "Ya existe un vendedor con ese código.");
    }
  }

  async actualizar(
    empresaId: bigint,
    id: bigint,
    dto: { nombre?: string; documento?: string; activo?: boolean },
  ) {
    const vendedor = await this.prisma.vendedor.findFirst({ where: { id, empresaId } });
    if (!vendedor) throw new NotFoundException("Vendedor no encontrado.");
    await this.prisma.vendedor.update({
      where: { id },
      data: { nombre: dto.nombre, documento: dto.documento, activo: dto.activo },
    });
    return { id: id.toString() };
  }

  private traducirError(error: unknown, mensajeUnico: string): Error {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return new BadRequestException(mensajeUnico);
    }
    return error instanceof Error ? error : new BadRequestException("Error desconocido");
  }
}
