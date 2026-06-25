import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../comun/prisma/prisma.service.js";

@Injectable()
export class AlmacenesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lista sucursales. Por defecto solo activas; incluye inactivas si se pide. */
  async listarSucursales(empresaId: bigint, incluirInactivos = false) {
    const sucursales = await this.prisma.sucursal.findMany({
      where: { empresaId, ...(incluirInactivos ? {} : { activo: true }) },
      orderBy: { codigo: "asc" },
    });
    return sucursales.map((s) => ({
      id: s.id.toString(),
      codigo: s.codigo,
      nombre: s.nombre,
      activo: s.activo,
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

  async actualizarSucursal(
    empresaId: bigint,
    sucursalId: bigint,
    dto: { codigo?: string; nombre?: string },
  ) {
    const sucursal = await this.prisma.sucursal.findFirst({
      where: { id: sucursalId, empresaId },
    });
    if (!sucursal) throw new NotFoundException("Sucursal no encontrada.");
    try {
      const actualizada = await this.prisma.sucursal.update({
        where: { id: sucursalId },
        data: {
          ...(dto.codigo !== undefined ? { codigo: dto.codigo } : {}),
          ...(dto.nombre !== undefined ? { nombre: dto.nombre } : {}),
        },
      });
      return {
        id: actualizada.id.toString(),
        codigo: actualizada.codigo,
        nombre: actualizada.nombre,
      };
    } catch (error) {
      throw this.traducirError(error, "Ya existe una sucursal con ese código.");
    }
  }

  /** Baja logica de la sucursal. Valida pertenencia a la empresa (anti-IDOR). */
  async darBajaSucursal(empresaId: bigint, sucursalId: bigint) {
    const sucursal = await this.prisma.sucursal.findFirst({
      where: { id: sucursalId, empresaId },
    });
    if (!sucursal) throw new NotFoundException("Sucursal no encontrada.");
    await this.prisma.sucursal.update({
      where: { id: sucursalId },
      data: { activo: false },
    });
    return { id: sucursalId.toString(), activo: false };
  }

  /** Reactiva una sucursal dada de baja. Valida pertenencia a la empresa. */
  async reactivarSucursal(empresaId: bigint, sucursalId: bigint) {
    const sucursal = await this.prisma.sucursal.findFirst({
      where: { id: sucursalId, empresaId },
    });
    if (!sucursal) throw new NotFoundException("Sucursal no encontrada.");
    await this.prisma.sucursal.update({
      where: { id: sucursalId },
      data: { activo: true },
    });
    return { id: sucursalId.toString(), activo: true };
  }

  /** Lista almacenes. Por defecto solo activos; incluye inactivos si se pide. */
  async listarAlmacenes(empresaId: bigint, incluirInactivos = false) {
    const almacenes = await this.prisma.almacen.findMany({
      where: { empresaId, ...(incluirInactivos ? {} : { activo: true }) },
      include: { sucursal: true },
      orderBy: { codigo: "asc" },
    });
    return almacenes.map((a) => ({
      id: a.id.toString(),
      codigo: a.codigo,
      nombre: a.nombre,
      sucursal: a.sucursal.nombre,
      sucursalId: a.sucursalId.toString(),
      activo: a.activo,
    }));
  }

  /** Baja logica del almacen. Valida pertenencia a la empresa (anti-IDOR). */
  async darBajaAlmacen(empresaId: bigint, almacenId: bigint) {
    await this.obtenerAlmacen(empresaId, almacenId);
    await this.prisma.almacen.update({
      where: { id: almacenId },
      data: { activo: false },
    });
    return { id: almacenId.toString(), activo: false };
  }

  /** Reactiva un almacen dado de baja. Valida pertenencia a la empresa. */
  async reactivarAlmacen(empresaId: bigint, almacenId: bigint) {
    await this.obtenerAlmacen(empresaId, almacenId);
    await this.prisma.almacen.update({
      where: { id: almacenId },
      data: { activo: true },
    });
    return { id: almacenId.toString(), activo: true };
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

  async actualizarAlmacen(
    empresaId: bigint,
    almacenId: bigint,
    dto: { codigo?: string; nombre?: string },
  ) {
    await this.obtenerAlmacen(empresaId, almacenId);
    try {
      const actualizado = await this.prisma.almacen.update({
        where: { id: almacenId },
        data: {
          ...(dto.codigo !== undefined ? { codigo: dto.codigo } : {}),
          ...(dto.nombre !== undefined ? { nombre: dto.nombre } : {}),
        },
        include: { sucursal: true },
      });
      return {
        id: actualizado.id.toString(),
        codigo: actualizado.codigo,
        nombre: actualizado.nombre,
        sucursal: actualizado.sucursal.nombre,
        sucursalId: actualizado.sucursalId.toString(),
      };
    } catch (error) {
      throw this.traducirError(error, "Ya existe un almacén con ese código.");
    }
  }

  // ── Zonas (ubicaciones gestionables dentro de un almacén) ──────────────

  async listarZonas(empresaId: bigint, almacenId: bigint) {
    await this.obtenerAlmacen(empresaId, almacenId);
    const zonas = await this.prisma.ubicacion.findMany({
      where: { empresaId, almacenId },
      orderBy: { codigo: "asc" },
    });
    return zonas.map((z) => this.mapearZona(z));
  }

  async crearZona(
    empresaId: bigint,
    almacenId: bigint,
    dto: { codigo: string; nombre: string; descripcion?: string },
  ) {
    await this.obtenerAlmacen(empresaId, almacenId);
    try {
      const zona = await this.prisma.ubicacion.create({
        data: {
          empresaId,
          almacenId,
          codigo: dto.codigo,
          nombre: dto.nombre,
          descripcion: dto.descripcion ?? null,
        },
      });
      return this.mapearZona(zona);
    } catch (error) {
      throw this.traducirError(error, "Ya existe una zona con ese código en este almacén.");
    }
  }

  async actualizarZona(
    empresaId: bigint,
    almacenId: bigint,
    zonaId: bigint,
    dto: { codigo?: string; nombre?: string; descripcion?: string | null; activo?: boolean },
  ) {
    await this.obtenerZona(empresaId, almacenId, zonaId);
    try {
      const zona = await this.prisma.ubicacion.update({
        where: { id: zonaId },
        data: {
          ...(dto.codigo !== undefined ? { codigo: dto.codigo } : {}),
          ...(dto.nombre !== undefined ? { nombre: dto.nombre } : {}),
          ...(dto.descripcion !== undefined ? { descripcion: dto.descripcion } : {}),
          ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
        },
      });
      return this.mapearZona(zona);
    } catch (error) {
      throw this.traducirError(error, "Ya existe una zona con ese código en este almacén.");
    }
  }

  async darBajaZona(empresaId: bigint, almacenId: bigint, zonaId: bigint) {
    await this.obtenerZona(empresaId, almacenId, zonaId);
    const zona = await this.prisma.ubicacion.update({
      where: { id: zonaId },
      data: { activo: false },
    });
    return this.mapearZona(zona);
  }

  private async obtenerAlmacen(empresaId: bigint, almacenId: bigint) {
    const almacen = await this.prisma.almacen.findFirst({
      where: { id: almacenId, empresaId },
    });
    if (!almacen) throw new NotFoundException("Almacén no encontrado.");
    return almacen;
  }

  private async obtenerZona(empresaId: bigint, almacenId: bigint, zonaId: bigint) {
    const zona = await this.prisma.ubicacion.findFirst({
      where: { id: zonaId, empresaId, almacenId },
    });
    if (!zona) throw new NotFoundException("Zona no encontrada.");
    return zona;
  }

  private mapearZona(z: {
    id: bigint;
    almacenId: bigint;
    codigo: string;
    nombre: string;
    descripcion: string | null;
    activo: boolean;
  }) {
    return {
      id: z.id.toString(),
      almacenId: z.almacenId.toString(),
      codigo: z.codigo,
      nombre: z.nombre,
      descripcion: z.descripcion,
      activo: z.activo,
    };
  }

  private traducirError(error: unknown, mensajeUnico: string): Error {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return new BadRequestException(mensajeUnico);
    }
    return error instanceof Error ? error : new BadRequestException("Error desconocido");
  }
}
