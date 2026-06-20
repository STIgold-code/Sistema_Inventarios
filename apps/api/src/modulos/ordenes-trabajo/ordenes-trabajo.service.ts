import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../comun/prisma/prisma.service.js";
import { CorrelativoService } from "../comun/correlativo/correlativo.service.js";

interface NuevaOrdenTrabajo {
  descripcion: string;
  centroCostoId: bigint;
}

interface CambiosOrdenTrabajo {
  descripcion?: string;
  centroCostoId?: bigint;
}

@Injectable()
export class OrdenesTrabajoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly correlativos: CorrelativoService,
  ) {}

  async listar(empresaId: bigint) {
    const filas = await this.prisma.ordenTrabajo.findMany({
      where: { empresaId },
      include: { centroCosto: true },
      orderBy: { fechaApertura: "desc" },
    });
    return filas.map((o) => this.serializar(o));
  }

  async obtener(empresaId: bigint, id: bigint) {
    const orden = await this.prisma.ordenTrabajo.findFirst({
      where: { id, empresaId },
      include: { centroCosto: true },
    });
    if (!orden) throw new NotFoundException("Orden de trabajo no encontrada");
    return this.serializar(orden);
  }

  /**
   * Crea la OT en estado ABIERTA. Valida que el centro de costo pertenezca a la
   * empresa (anti-IDOR). El numero usa el correlativo ORDEN_TRABAJO.
   */
  async crear(empresaId: bigint, dto: NuevaOrdenTrabajo) {
    await this.validarCentroCosto(empresaId, dto.centroCostoId);

    const id = await this.prisma.$transaction(async (tx) => {
      const correlativo = await this.correlativos.siguiente(tx, empresaId, "ORDEN_TRABAJO");
      const orden = await tx.ordenTrabajo.create({
        data: {
          empresaId,
          numero: correlativo.formateado,
          descripcion: dto.descripcion,
          centroCostoId: dto.centroCostoId,
          estado: "ABIERTA",
        },
      });
      return orden.id;
    });

    return { id: id.toString() };
  }

  /** Solo se puede editar una OT ABIERTA. */
  async actualizar(empresaId: bigint, id: bigint, dto: CambiosOrdenTrabajo) {
    const orden = await this.cargar(empresaId, id);
    if (orden.estado !== "ABIERTA") {
      throw new BadRequestException("Solo se puede editar una orden de trabajo abierta");
    }
    if (dto.centroCostoId !== undefined) {
      await this.validarCentroCosto(empresaId, dto.centroCostoId);
    }
    await this.prisma.ordenTrabajo.update({
      where: { id: orden.id },
      data: { descripcion: dto.descripcion, centroCostoId: dto.centroCostoId },
    });
    return { id: id.toString() };
  }

  /** ABIERTA -> CERRADA. Registra la fecha de cierre. */
  async cerrar(empresaId: bigint, id: bigint) {
    const orden = await this.cargar(empresaId, id);
    if (orden.estado === "CERRADA") {
      throw new BadRequestException("La orden de trabajo ya esta cerrada");
    }
    await this.prisma.ordenTrabajo.update({
      where: { id: orden.id },
      data: { estado: "CERRADA", fechaCierre: new Date() },
    });
    return { id: id.toString(), estado: "CERRADA" };
  }

  private async validarCentroCosto(empresaId: bigint, centroCostoId: bigint) {
    const centro = await this.prisma.centroCosto.findFirst({
      where: { id: centroCostoId, empresaId },
    });
    if (!centro) throw new NotFoundException("Centro de costo no encontrado");
  }

  private async cargar(empresaId: bigint, id: bigint) {
    const orden = await this.prisma.ordenTrabajo.findFirst({ where: { id, empresaId } });
    if (!orden) throw new NotFoundException("Orden de trabajo no encontrada");
    return orden;
  }

  private serializar(orden: {
    id: bigint;
    numero: string;
    descripcion: string;
    estado: string;
    centroCostoId: bigint;
    fechaApertura: Date;
    fechaCierre: Date | null;
    centroCosto?: { nombre: string };
  }) {
    return {
      id: orden.id.toString(),
      numero: orden.numero,
      descripcion: orden.descripcion,
      estado: orden.estado,
      centroCostoId: orden.centroCostoId.toString(),
      centroCosto: orden.centroCosto?.nombre ?? null,
      fechaApertura: orden.fechaApertura.toISOString(),
      fechaCierre: orden.fechaCierre ? orden.fechaCierre.toISOString() : null,
    };
  }
}
