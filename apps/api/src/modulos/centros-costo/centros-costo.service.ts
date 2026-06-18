import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../comun/prisma/prisma.service.js";

@Injectable()
export class CentrosCostoService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(empresaId: bigint) {
    const centros = await this.prisma.centroCosto.findMany({
      where: { empresaId },
      orderBy: { codigo: "asc" },
    });
    return centros.map((c) => ({
      id: c.id.toString(),
      codigo: c.codigo,
      nombre: c.nombre,
      activo: c.activo,
    }));
  }

  async crear(empresaId: bigint, dto: { codigo: string; nombre: string }) {
    try {
      const centro = await this.prisma.centroCosto.create({
        data: { empresaId, codigo: dto.codigo, nombre: dto.nombre },
      });
      return { id: centro.id.toString() };
    } catch (error) {
      throw this.traducirError(error, "Ya existe un centro de costo con ese código.");
    }
  }

  async actualizar(
    empresaId: bigint,
    id: bigint,
    dto: { nombre?: string; activo?: boolean },
  ) {
    const centro = await this.prisma.centroCosto.findFirst({ where: { id, empresaId } });
    if (!centro) throw new NotFoundException("Centro de costo no encontrado.");
    await this.prisma.centroCosto.update({
      where: { id },
      data: { nombre: dto.nombre, activo: dto.activo },
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
