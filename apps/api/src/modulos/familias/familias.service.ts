import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../comun/prisma/prisma.service.js";
import type { ActualizarFamiliaDto, CrearFamiliaDto } from "./dto/familia.dto.js";

export interface FamiliaListado {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
}

export interface FiltroFamilias {
  /** Si true incluye tambien las familias dadas de baja (activo = false). */
  incluirInactivas?: boolean;
}

@Injectable()
export class FamiliasService {
  constructor(private readonly prisma: PrismaService) {}

  /** Familias de la empresa ordenadas por codigo. Por defecto solo activas. */
  async listar(empresaId: bigint, filtro: FiltroFamilias = {}): Promise<FamiliaListado[]> {
    const familias = await this.prisma.familia.findMany({
      where: {
        empresaId,
        ...(filtro.incluirInactivas ? {} : { activo: true }),
      },
      orderBy: { codigo: "asc" },
    });
    return familias.map((f) => this.mapear(f));
  }

  /** Crea una familia validando unicidad de codigo por empresa. */
  async crear(empresaId: bigint, dto: CrearFamiliaDto): Promise<FamiliaListado> {
    const existente = await this.prisma.familia.findFirst({
      where: { empresaId, codigo: dto.codigo },
    });
    if (existente) {
      throw new BadRequestException(`Ya existe una familia con el codigo ${dto.codigo}`);
    }

    const familia = await this.prisma.familia.create({
      data: { empresaId, codigo: dto.codigo, nombre: dto.nombre },
    });
    return this.mapear(familia);
  }

  /** Edita nombre y/o estado activo. Valida pertenencia a la empresa (anti-IDOR). */
  async actualizar(
    empresaId: bigint,
    id: bigint,
    dto: ActualizarFamiliaDto,
  ): Promise<FamiliaListado> {
    const familia = await this.prisma.familia.findFirst({ where: { id, empresaId } });
    if (!familia) {
      throw new NotFoundException("La familia no existe o no pertenece a la empresa");
    }

    const familiaActualizada = await this.prisma.familia.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined ? { nombre: dto.nombre } : {}),
        ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
      },
    });
    return this.mapear(familiaActualizada);
  }

  /** Baja logica: marca activo = false sin borrar el historico de productos. */
  async darDeBaja(empresaId: bigint, id: bigint): Promise<FamiliaListado> {
    const familia = await this.prisma.familia.findFirst({ where: { id, empresaId } });
    if (!familia) {
      throw new NotFoundException("La familia no existe o no pertenece a la empresa");
    }

    const familiaActualizada = await this.prisma.familia.update({
      where: { id },
      data: { activo: false },
    });
    return this.mapear(familiaActualizada);
  }

  private mapear(familia: {
    id: bigint;
    codigo: string;
    nombre: string;
    activo: boolean;
  }): FamiliaListado {
    return {
      id: familia.id.toString(),
      codigo: familia.codigo,
      nombre: familia.nombre,
      activo: familia.activo,
    };
  }
}
