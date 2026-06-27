import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../comun/prisma/prisma.service.js";

@Injectable()
export class TransportistasService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(empresaId: bigint) {
    const filas = await this.prisma.transportista.findMany({
      where: { empresaId },
      orderBy: { codigo: "asc" },
    });
    return filas.map((t) => ({
      id: t.id.toString(),
      codigo: t.codigo,
      ruc: t.ruc,
      nombre: t.nombre,
      activo: t.activo,
    }));
  }

  async crear(
    empresaId: bigint,
    dto: { codigo: string; nombre: string; ruc?: string },
  ) {
    try {
      const t = await this.prisma.transportista.create({
        data: {
          empresaId,
          codigo: dto.codigo,
          nombre: dto.nombre,
          ruc: dto.ruc ?? null,
        },
      });
      return { id: t.id.toString() };
    } catch (error) {
      throw this.traducirError(error, "Ya existe un transportista con ese código.");
    }
  }

  async actualizar(
    empresaId: bigint,
    id: bigint,
    dto: { nombre?: string; ruc?: string; activo?: boolean },
  ) {
    const t = await this.prisma.transportista.findFirst({ where: { id, empresaId } });
    if (!t) throw new NotFoundException("Transportista no encontrado.");
    await this.prisma.transportista.update({
      where: { id },
      data: { nombre: dto.nombre, ruc: dto.ruc, activo: dto.activo },
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
