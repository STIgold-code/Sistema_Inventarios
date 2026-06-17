import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../comun/prisma/prisma.service.js";

@Injectable()
export class AlmacenesService {
  constructor(private readonly prisma: PrismaService) {}

  async listarSucursales(empresaId: bigint) {
    const sucursales = await this.prisma.sucursal.findMany({
      where: { empresaId },
      orderBy: { codigo: "asc" },
    });
    return sucursales.map((s) => ({
      id: s.id.toString(),
      codigo: s.codigo,
      nombre: s.nombre,
    }));
  }

  async crearSucursal(empresaId: bigint, dto: { codigo: string; nombre: string }) {
    try {
      const sucursal = await this.prisma.sucursal.create({
        data: { empresaId, codigo: dto.codigo, nombre: dto.nombre },
      });
      return { id: sucursal.id.toString() };
    } catch (error) {
      throw this.traducirError(error, "Ya existe una sucursal con ese código.");
    }
  }

  async listarAlmacenes(empresaId: bigint) {
    const almacenes = await this.prisma.almacen.findMany({
      where: { empresaId },
      include: { sucursal: true },
      orderBy: { codigo: "asc" },
    });
    return almacenes.map((a) => ({
      id: a.id.toString(),
      codigo: a.codigo,
      nombre: a.nombre,
      sucursal: a.sucursal.nombre,
      sucursalId: a.sucursalId.toString(),
    }));
  }

  async crearAlmacen(
    empresaId: bigint,
    dto: { sucursalId: bigint; codigo: string; nombre: string },
  ) {
    const sucursal = await this.prisma.sucursal.findFirst({
      where: { id: dto.sucursalId, empresaId },
    });
    if (!sucursal) throw new NotFoundException("Sucursal no encontrada.");
    try {
      const almacen = await this.prisma.almacen.create({
        data: {
          empresaId,
          sucursalId: dto.sucursalId,
          codigo: dto.codigo,
          nombre: dto.nombre,
        },
      });
      return { id: almacen.id.toString() };
    } catch (error) {
      throw this.traducirError(error, "Ya existe un almacén con ese código.");
    }
  }

  private traducirError(error: unknown, mensajeUnico: string): Error {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return new BadRequestException(mensajeUnico);
    }
    return error instanceof Error ? error : new BadRequestException("Error desconocido");
  }
}
