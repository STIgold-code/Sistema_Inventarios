import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../comun/prisma/prisma.service.js";

const D = Prisma.Decimal;

interface NuevaCategoria {
  nombre: string;
  vidaUtilMeses: number;
  tasaAnual: string;
}

interface NuevoActivo {
  sucursalId: bigint;
  categoriaId: bigint;
  codigo: string;
  nombre: string;
  marca?: string;
  modelo?: string;
  numeroSerie?: string;
  departamento?: string;
  fechaCompra: string;
  valorAdquisicion: string;
  valorResidual?: string;
  vidaUtilMeses: number;
}

@Injectable()
export class ActivosService {
  constructor(private readonly prisma: PrismaService) {}

  async crearCategoria(empresaId: bigint, dto: NuevaCategoria) {
    const cat = await this.prisma.categoriaActivo.create({
      data: {
        empresaId,
        nombre: dto.nombre,
        vidaUtilMeses: dto.vidaUtilMeses,
        tasaAnual: dto.tasaAnual,
      },
    });
    return { id: cat.id.toString() };
  }

  async listarCategorias(empresaId: bigint) {
    const cats = await this.prisma.categoriaActivo.findMany({
      where: { empresaId },
      orderBy: { nombre: "asc" },
    });
    return cats.map((c) => ({
      id: c.id.toString(),
      nombre: c.nombre,
      vidaUtilMeses: c.vidaUtilMeses,
      tasaAnual: c.tasaAnual.toString(),
    }));
  }

  async crearActivo(empresaId: bigint, dto: NuevoActivo) {
    const categoria = await this.prisma.categoriaActivo.findFirst({
      where: { id: dto.categoriaId, empresaId },
    });
    if (!categoria) throw new NotFoundException("Categoria no encontrada");

    const valorAdquisicion = new D(dto.valorAdquisicion);
    const activo = await this.prisma.activoFijo.create({
      data: {
        empresaId,
        sucursalId: dto.sucursalId,
        categoriaId: dto.categoriaId,
        codigo: dto.codigo,
        nombre: dto.nombre,
        marca: dto.marca ?? null,
        modelo: dto.modelo ?? null,
        numeroSerie: dto.numeroSerie ?? null,
        departamento: dto.departamento ?? null,
        fechaCompra: new Date(dto.fechaCompra),
        valorAdquisicion,
        valorResidual: dto.valorResidual ?? "0",
        vidaUtilMeses: dto.vidaUtilMeses,
        valorActual: valorAdquisicion,
      },
    });
    return { id: activo.id.toString() };
  }

  async listarActivos(empresaId: bigint) {
    const activos = await this.prisma.activoFijo.findMany({
      where: { empresaId },
      include: { categoria: true },
      orderBy: { codigo: "asc" },
    });
    return activos.map((a) => ({
      id: a.id.toString(),
      codigo: a.codigo,
      nombre: a.nombre,
      categoria: a.categoria.nombre,
      marca: a.marca,
      estado: a.estado,
      valorAdquisicion: a.valorAdquisicion.toString(),
      depreciacionAcumulada: a.depreciacionAcumulada.toString(),
      valorActual: a.valorActual.toString(),
    }));
  }

  /**
   * Depreciacion lineal del periodo: por cada activo operativo genera la cuota
   * mensual (valorAdquisicion - valorResidual) / vidaUtilMeses, actualiza la
   * acumulada y el valor en libros. Idempotente por (activo, periodo).
   */
  async depreciar(empresaId: bigint, periodo: string) {
    const activos = await this.prisma.activoFijo.findMany({
      where: { empresaId, estado: "OPERATIVO" },
    });

    let procesados = 0;
    for (const activo of activos) {
      const yaProcesado = await this.prisma.depreciacionActivo.findUnique({
        where: { empresaId_activoId_periodo: { empresaId, activoId: activo.id, periodo } },
      });
      if (yaProcesado) continue;

      const base = new D(activo.valorAdquisicion).sub(new D(activo.valorResidual));
      const cuota = base.div(activo.vidaUtilMeses);
      const acumuladaPrev = new D(activo.depreciacionAcumulada);
      let nuevaAcumulada = acumuladaPrev.add(cuota);
      // No depreciar por debajo del valor residual.
      const maxDepreciable = new D(activo.valorAdquisicion).sub(new D(activo.valorResidual));
      if (nuevaAcumulada.greaterThan(maxDepreciable)) {
        nuevaAcumulada = maxDepreciable;
      }
      const cuotaReal = nuevaAcumulada.sub(acumuladaPrev);
      if (cuotaReal.lessThanOrEqualTo(0)) continue;

      const valorEnLibros = new D(activo.valorAdquisicion).sub(nuevaAcumulada);

      await this.prisma.$transaction([
        this.prisma.depreciacionActivo.create({
          data: {
            empresaId,
            activoId: activo.id,
            periodo,
            montoPeriodo: cuotaReal,
            acumuladoHasta: nuevaAcumulada,
            valorEnLibros,
          },
        }),
        this.prisma.activoFijo.update({
          where: { id: activo.id },
          data: { depreciacionAcumulada: nuevaAcumulada, valorActual: valorEnLibros },
        }),
      ]);
      procesados += 1;
    }

    if (procesados === 0 && activos.length === 0) {
      throw new BadRequestException("No hay activos operativos para depreciar");
    }
    return { procesados };
  }
}
