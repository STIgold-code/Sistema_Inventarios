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

    // Validaciones cruzadas que el DTO (campos string sueltos) no puede hacer.
    const valorAdquisicion = new D(dto.valorAdquisicion);
    if (valorAdquisicion.lessThanOrEqualTo(0)) {
      throw new BadRequestException("El valor de adquisicion debe ser mayor a 0.");
    }
    const valorResidual = new D(dto.valorResidual ?? "0");
    if (valorResidual.lessThan(0)) {
      throw new BadRequestException("El valor residual no puede ser negativo.");
    }
    if (valorResidual.greaterThan(valorAdquisicion)) {
      throw new BadRequestException(
        "El valor residual no puede superar el valor de adquisicion.",
      );
    }
    if (dto.vidaUtilMeses <= 0) {
      throw new BadRequestException("La vida util en meses debe ser mayor a 0.");
    }
    const fechaCompra = new Date(dto.fechaCompra);
    if (Number.isNaN(fechaCompra.getTime())) {
      throw new BadRequestException("La fecha de compra no es valida.");
    }
    if (fechaCompra.getTime() > Date.now()) {
      throw new BadRequestException("La fecha de compra no puede ser futura.");
    }

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
        fechaCompra,
        valorAdquisicion,
        valorResidual,
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
    if (activos.length === 0) {
      throw new BadRequestException("No hay activos operativos para depreciar");
    }

    // Pre-carga en UNA query las depreciaciones ya hechas del periodo (evita el
    // N+1 de un findUnique por activo dentro del loop).
    const yaHechas = await this.prisma.depreciacionActivo.findMany({
      where: { empresaId, periodo, activoId: { in: activos.map((a) => a.id) } },
      select: { activoId: true },
    });
    const procesadosPrevios = new Set(yaHechas.map((d) => d.activoId.toString()));

    // Se arman TODAS las operaciones y se ejecutan en UNA sola transaccion: la
    // corrida es todo-o-nada, no quedan N activos depreciados y M sin depreciar
    // si el proceso falla a mitad.
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    let omitidos = 0;
    for (const activo of activos) {
      if (procesadosPrevios.has(activo.id.toString())) {
        omitidos += 1;
        continue;
      }
      // Guard defensivo: vida util 0 reventaria div() y abortaria toda la corrida.
      if (activo.vidaUtilMeses <= 0) {
        omitidos += 1;
        continue;
      }
      // No depreciar un periodo anterior al mes de compra del activo.
      // periodo viene como AAAA-MM (ver DepreciarDto); se compara en el mismo
      // formato para no depreciar meses anteriores a la compra del activo.
      const compra = activo.fechaCompra;
      const periodoCompra = `${compra.getFullYear()}-${String(compra.getMonth() + 1).padStart(2, "0")}`;
      if (periodo < periodoCompra) {
        omitidos += 1;
        continue;
      }

      const acumuladaPrev = new D(activo.depreciacionAcumulada);
      const cuota = new D(activo.valorAdquisicion)
        .sub(new D(activo.valorResidual))
        .div(activo.vidaUtilMeses);
      let nuevaAcumulada = acumuladaPrev.add(cuota);
      // No depreciar por debajo del valor residual.
      const maxDepreciable = new D(activo.valorAdquisicion).sub(new D(activo.valorResidual));
      if (nuevaAcumulada.greaterThan(maxDepreciable)) {
        nuevaAcumulada = maxDepreciable;
      }
      const cuotaReal = nuevaAcumulada.sub(acumuladaPrev);
      if (cuotaReal.lessThanOrEqualTo(0)) {
        omitidos += 1;
        continue;
      }

      const valorEnLibros = new D(activo.valorAdquisicion).sub(nuevaAcumulada);
      ops.push(
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
        // updateMany con empresaId en el WHERE: aislamiento por empresa invariante.
        this.prisma.activoFijo.updateMany({
          where: { id: activo.id, empresaId },
          data: { depreciacionAcumulada: nuevaAcumulada, valorActual: valorEnLibros },
        }),
      );
    }

    const procesados = ops.length / 2;
    if (procesados > 0) {
      await this.prisma.$transaction(ops);
    }
    return { procesados, omitidos, totalOperativos: activos.length };
  }
}
