import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../comun/prisma/prisma.service.js";
import type { CrearProductoDto } from "./dto/crear-producto.dto.js";

const D = Prisma.Decimal;

export interface FamiliaResumen {
  id: string;
  codigo: string;
  nombre: string;
}

export interface UnidadResumen {
  id: string;
  codigo: string;
  nombre: string;
}

export interface SkuListado {
  id: string;
  codigoParlante: string;
  codigoUnspsc: string | null;
  codigoBarras: string | null;
  nombre: string | null;
  tipoExistencia: string;
  metodoValuacion: string;
  stockMinimo: string | null;
  activo: boolean;
  producto: {
    id: string;
    nombre: string;
    activo: boolean;
  };
  familia: {
    id: string;
    codigo: string;
    nombre: string;
  };
  unidad: {
    id: string;
    codigo: string;
    nombre: string;
  };
}

export interface FiltroSkus {
  pagina?: number;
  porPagina?: number;
  busqueda?: string;
}

export interface PaginaSkus {
  datos: SkuListado[];
  pagina: number;
  porPagina: number;
  total: number;
}

const POR_PAGINA_DEFECTO = 20;
const POR_PAGINA_MAXIMO = 100;
const TIPO_EXISTENCIA_DEFECTO = "01";
const METODO_VALUACION_DEFECTO = "2";

/**
 * Catalogo de productos. Un Producto agrupa SKUs (presentaciones vendibles);
 * el primer SKU se crea junto con el producto. El codigo parlante de 14 digitos
 * codifica en sus 3 primeros la familia a la que pertenece (regla de negocio BM).
 */
@Injectable()
export class ProductoService {
  constructor(private readonly prisma: PrismaService) {}

  /** Familias de la empresa, ordenadas por codigo para navegacion estable. */
  async listarFamilias(empresaId: bigint): Promise<FamiliaResumen[]> {
    const familias = await this.prisma.familia.findMany({
      where: { empresaId },
      orderBy: { codigo: "asc" },
    });
    return familias.map((f) => ({
      id: f.id.toString(),
      codigo: f.codigo,
      nombre: f.nombre,
    }));
  }

  /** Unidades de medida de la empresa, ordenadas por codigo. */
  async listarUnidades(empresaId: bigint): Promise<UnidadResumen[]> {
    const unidades = await this.prisma.unidad.findMany({
      where: { empresaId },
      orderBy: { codigo: "asc" },
    });
    return unidades.map((u) => ({
      id: u.id.toString(),
      codigo: u.codigo,
      nombre: u.nombre,
    }));
  }

  /**
   * Crea un Producto y su primer SKU en una sola transaccion atomica.
   * Valida pertenencia de familia y unidad a la empresa, y que el prefijo
   * del codigo parlante (3 primeros digitos) coincida con el codigo de la familia.
   */
  async crearProductoConSku(
    empresaId: bigint,
    dto: CrearProductoDto,
  ): Promise<{ productoId: string; skuId: string }> {
    const familiaId = BigInt(dto.familiaId);
    const unidadId = BigInt(dto.unidadId);

    const familia = await this.prisma.familia.findFirst({
      where: { id: familiaId, empresaId },
    });
    if (!familia) {
      throw new BadRequestException("La familia indicada no pertenece a la empresa");
    }

    const unidad = await this.prisma.unidad.findFirst({
      where: { id: unidadId, empresaId },
    });
    if (!unidad) {
      throw new BadRequestException("La unidad indicada no pertenece a la empresa");
    }

    // Regla de negocio BM: los 3 primeros digitos del codigo parlante
    // codifican la familia y deben coincidir con su codigo.
    const prefijoFamilia = dto.codigoParlante.slice(0, 3);
    if (prefijoFamilia !== familia.codigo) {
      throw new BadRequestException(
        `Los 3 primeros digitos del codigo parlante (${prefijoFamilia}) deben coincidir con el codigo de la familia (${familia.codigo})`,
      );
    }

    const resultado = await this.prisma.$transaction(async (tx) => {
      const producto = await tx.producto.create({
        data: {
          empresaId,
          familiaId,
          nombre: dto.nombre,
          descripcion: dto.descripcion ?? null,
        },
      });

      const sku = await tx.sku.create({
        data: {
          empresaId,
          productoId: producto.id,
          codigoParlante: dto.codigoParlante,
          codigoUnspsc: dto.codigoUnspsc ?? null,
          codigoBarras: dto.codigoBarras ?? null,
          unidadId,
          nombre: dto.nombreSku ?? null,
          tipoExistencia: dto.tipoExistencia ?? TIPO_EXISTENCIA_DEFECTO,
          metodoValuacion: dto.metodoValuacion ?? METODO_VALUACION_DEFECTO,
          stockMinimo: dto.stockMinimo ? new D(dto.stockMinimo) : null,
        },
      });

      return { productoId: producto.id, skuId: sku.id };
    });

    return {
      productoId: resultado.productoId.toString(),
      skuId: resultado.skuId.toString(),
    };
  }

  /** Lista SKUs con su producto, familia y unidad. Paginacion simple por offset. */
  async listarSkus(empresaId: bigint, filtro: FiltroSkus = {}): Promise<PaginaSkus> {
    const pagina = filtro.pagina && filtro.pagina > 0 ? filtro.pagina : 1;
    const porPagina = this.normalizarPorPagina(filtro.porPagina);
    const busqueda = filtro.busqueda?.trim();

    const where: Prisma.SkuWhereInput = {
      empresaId,
      ...(busqueda
        ? {
            OR: [
              { codigoParlante: { contains: busqueda, mode: "insensitive" } },
              { nombre: { contains: busqueda, mode: "insensitive" } },
              { producto: { nombre: { contains: busqueda, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const [total, skus] = await this.prisma.$transaction([
      this.prisma.sku.count({ where }),
      this.prisma.sku.findMany({
        where,
        include: {
          producto: { include: { familia: true } },
          unidad: true,
        },
        orderBy: { codigoParlante: "asc" },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
    ]);

    return {
      datos: skus.map((s) => ({
        id: s.id.toString(),
        codigoParlante: s.codigoParlante,
        codigoUnspsc: s.codigoUnspsc,
        codigoBarras: s.codigoBarras,
        nombre: s.nombre,
        tipoExistencia: s.tipoExistencia,
        metodoValuacion: s.metodoValuacion,
        stockMinimo: s.stockMinimo ? s.stockMinimo.toString() : null,
        activo: s.activo,
        producto: {
          id: s.producto.id.toString(),
          nombre: s.producto.nombre,
          activo: s.producto.activo,
        },
        familia: {
          id: s.producto.familia.id.toString(),
          codigo: s.producto.familia.codigo,
          nombre: s.producto.familia.nombre,
        },
        unidad: {
          id: s.unidad.id.toString(),
          codigo: s.unidad.codigo,
          nombre: s.unidad.nombre,
        },
      })),
      pagina,
      porPagina,
      total,
    };
  }

  private normalizarPorPagina(valor?: number): number {
    if (!valor || valor <= 0) return POR_PAGINA_DEFECTO;
    return Math.min(valor, POR_PAGINA_MAXIMO);
  }
}
